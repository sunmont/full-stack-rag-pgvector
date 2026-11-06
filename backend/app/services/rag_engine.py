import os
from typing import List, Dict, Any
from sentence_transformers import CrossEncoder, SentenceTransformer
import asyncpg
from pgvector.asyncpg import register_vector

class ProductionHybridRAGEngine:
    def __init__(self):
        self.embedding_model = SentenceTransformer("BAAI/bge-small-en-v1.5") # Match your DB dimensions
        self.reranker = CrossEncoder("BAAI/bge-reranker-large")
        self.db_url = os.getenv("DATABASE_URL")

    async def hybrid_search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        # 1. Generate query embedding
        query_embedding = self.embedding_model.encode(query).tolist()
        
        conn = await asyncpg.connect(self.db_url)
        await register_vector(conn)
        try:
            # 2. Hybrid SQL query using dense vector + FTS with RRF
            sql = """
                WITH vector_matches AS (
                    SELECT id, content, metadata,
                           ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) as vector_rank
                    FROM documents
                    ORDER BY embedding <=> $1::vector
                    LIMIT $2
                ),
                fts_matches AS (
                    SELECT id, content, metadata,
                           ROW_NUMBER() OVER (ORDER BY ts_rank(search_vector, plainto_tsquery('english', $3)) DESC) as fts_rank
                    FROM documents
                    WHERE search_vector @@ plainto_tsquery('english', $3)
                    ORDER BY ts_rank(search_vector, plainto_tsquery('english', $3)) DESC
                    LIMIT $2
                ),
                combined AS (
                    SELECT 
                        COALESCE(v.id, f.id) as id,
                        COALESCE(v.content, f.content) as content,
                        COALESCE(v.metadata, f.metadata) as metadata,
                        COALESCE(1.0 / (60 + v.vector_rank), 0.0) + 
                        COALESCE(1.0 / (60 + f.fts_rank), 0.0) as rrf_score
                    FROM vector_matches v
                    FULL OUTER JOIN fts_matches f ON v.id = f.id
                )
                SELECT id, content, metadata, rrf_score
                FROM combined
                ORDER BY rrf_score DESC
                LIMIT $2;
            """
            print(f"Executing hybrid search SQL with query: {query} and embedding: {query_embedding}")
            rows = await conn.fetch(sql, query_embedding, top_k * 2, query)
            candidates = [dict(row) for row in rows]
            
            if not candidates:
                return []

            # 3. Apply Cross-Encoder Reranking
            pairs = [[query, doc["content"]] for doc in candidates]
            scores = self.reranker.predict(pairs)
            
            for i, doc in enumerate(candidates):
                doc["rerank_score"] = float(scores[i])
                
            # Sort by reranker score and return top_k
            candidates.sort(key=lambda x: x["rerank_score"], reverse=True)
            return candidates[:top_k]

        finally:
            await conn.close()