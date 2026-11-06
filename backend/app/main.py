import os
import re
import json
import asyncpg
from pgvector.asyncpg import register_vector
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

from google import genai
import pybreaker

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.services.rag_engine import ProductionHybridRAGEngine

# Initialize Google GenAI client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Database pool lifecycle
db_pool = None

async def init_db():
    global db_pool
    # 1. Create the global connection pool
    db_pool = await asyncpg.create_pool(os.getenv("DATABASE_URL"))

    async with db_pool.acquire() as conn:
    # 2. Register pgvector codec for asyncpg
        await register_vector(conn)

        # 3. Ensure table supports 384 dimensions and FTS search_vector
        await conn.execute("""
            CREATE EXTENSION IF NOT EXISTS vector;

            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                content TEXT,
                metadata JSONB,
                embedding VECTOR(384),
                search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
            );
            
            CREATE INDEX IF NOT EXISTS idx_documents_fts ON documents USING gin(search_vector);
        """)

        # 4. Insert seed document if empty
        count = await conn.fetchval("SELECT COUNT(*) FROM documents;")
        if count == 0:
            dummy_embedding = [0.01] * 384
            await conn.execute("""
                INSERT INTO documents (content, metadata, embedding) 
                VALUES ($1, $2::jsonb, $3::vector);
            """, 
            "Enterprise AI architecture relies on Next.js 15, FastAPI, and pgvector.",
            '{"source": "doc_1"}',
            dummy_embedding)
            print("🌱 Seed document inserted successfully.")

    print("✅ Database initialized successfully with 384 dimensions and FTS.")
   
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        yield
    finally:
        # Shutdown: Close the global pool safely
        global db_pool
        if db_pool:
            await db_pool.close()
            print("🛑 Database connection pool closed.")

app = FastAPI(title="Enterprise AI Engine with Gemini", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Edge-Level WAF Middleware
class PromptInjectionWAFMiddleware(BaseHTTPMiddleware):
    INJECTION_PATTERNS = [r"(?i)ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts|rules)"]

    async def dispatch(self, request: Request, call_next):
        if request.method == "POST":
            body = await request.body()
            text = body.decode("utf-8", errors="ignore")
            for pattern in self.INJECTION_PATTERNS:
                if re.search(pattern, text):
                    raise HTTPException(status_code=403, detail="WAF Block: Injection detected.")
        return await call_next(request)

app.add_middleware(PromptInjectionWAFMiddleware)

# 2. PII Redaction Engine
analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()
rag_engine = ProductionHybridRAGEngine()

def sanitize_pii(text: str) -> str:
    analysis = analyzer.analyze(text=text, entities=["PHONE_NUMBER", "EMAIL_ADDRESS", "PERSON"], language="en")
    result = anonymizer.anonymize(text=text, analyzer_results=analysis)
    return result.text

class ChatRequest(BaseModel):
    messages: list[dict]

# Circuit breaker protection for Gemini requests
gemini_breaker = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=30)

@gemini_breaker
def call_gemini(prompt: str) -> str:
    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )
        print(f"✅ Gemini API call successful. Response: {response.text}")
        return response.text
    except Exception as e:
        print(f"🔥 GEMINI API EXCEPTION CAUGHT: {str(e)}")
        traceback.print_exc()
        raise e
@gemini_breaker    
async def gemini_stream_generator(prompt: str):
    try:
        # Use generate_content_stream instead of generate_content
        response_stream = client.models.generate_content_stream(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )
        
        for chunk in response_stream:
            if chunk.text:
                # Wrap the token chunk in a JSON payload or send raw text
                payload = json.dumps({"content": chunk.text})
                yield f"data: {payload}\n\n"
                
        # Send a terminal signal so the frontend knows the stream is complete
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        error_payload = json.dumps({"error": str(e)})
        yield f"data: {error_payload}\n\n"

@app.post("/api/v1/chat")
async def chat_endpoint(payload: ChatRequest):
    try:
        last_message = payload.messages[-1]["content"] if payload.messages else ""
        clean_prompt = sanitize_pii(last_message)
        
        # Call hybrid search with FTS, pgvector, and reranking
        retrieved_docs = await rag_engine.hybrid_search(query=clean_prompt, top_k=3)
        
        # Format the retrieved documents into the context string
        rag_context = "\n\n".join([doc["content"] for doc in retrieved_docs]) if retrieved_docs else ""

        final_prompt = f"Context: {rag_context}\n\nUser Question: {clean_prompt}" if rag_context else clean_prompt

        # Return a StreamingResponse with media_type text/event-stream
        return StreamingResponse(
            gemini_stream_generator(final_prompt),
            media_type="text/event-stream"
        )
    except Exception as e:
        print("❌ CRITICAL ERROR IN CHAT ENDPOINT:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class IngestRequest(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    chunk_size: int = 500
    chunk_overlap: int = 50

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split long text into overlapping chunks for precise retrieval."""
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

@app.post("/api/v1/documents/ingest")
async def ingest_document_endpoint(request: IngestRequest):
    try:
        chunks = chunk_text(request.content, request.chunk_size, request.chunk_overlap)
        embeddings = [rag_engine.embedding_model.encode(chunk).tolist() for chunk in chunks]
        
        inserted_count = 0
        async with db_pool.acquire() as conn:
            await register_vector(conn)
            
            for chunk, embedding in zip(chunks, embeddings):
                # Convert the metadata dict to a JSON string
                metadata_json = json.dumps(request.metadata)
                
                await conn.execute("""
                    INSERT INTO documents (content, metadata, embedding) 
                    VALUES ($1, $2::jsonb, $3::vector);
                """, chunk, metadata_json, embedding)
                inserted_count += 1
                
        return {
            "status": "success",
            "message": f"Successfully ingested {inserted_count} chunks into PostgreSQL.",
            "total_chunks": len(chunks)
        }
    except Exception as e:
        print(f"❌ CRITICAL ERROR IN INGESTION ENDPOINT: {e}")
        raise HTTPException(status_code=500, detail=str(e))