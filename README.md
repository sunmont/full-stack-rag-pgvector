# Full-Stack Hybrid RAG Pipeline 🚀

A production-ready, high-performance **Retrieval-Augmented Generation (RAG)** system built with **Next.js 15**, **FastAPI**, and **PostgreSQL (`pgvector`)**. This pipeline combines dense vector similarity search and PostgreSQL Full-Text Search (FTS) using **Reciprocal Rank Fusion (RRF)**, followed by cross-encoder reranking (`BAAI/bge-reranker-large`) for maximum retrieval precision.

---

## 🏗️ Architecture & Tech Stack

```
[ Next.js 15 Frontend ] ──(SSE Stream / JSON)──> [ FastAPI Backend ]
        │                                                  │
   (Chat / Ingest UI)                               (Chunking & Embedding)
                                                           │
                                            [ PostgreSQL + pgvector + FTS ]
```

* **Frontend:** Next.js 15 (App Router), React Context state management, Tailwind CSS, Server-Sent Events (SSE) streaming consumer.
* **Backend:** Python 3.12, FastAPI, `asyncpg`, HuggingFace embedding models (`sentence-transformers`), Cross-Encoder reranking.
* **Database:** PostgreSQL 16+ with the `pgvector` extension, JSONB metadata storage, and GIN indices for full-text search.

---

## ✨ Key Features

1. **Hybrid Search Pipeline:** Merges semantic vector similarity (`<=>` cosine distance) with keyword-based Full-Text Search using Reciprocal Rank Fusion (RRF).
2. **Cross-Encoder Reranking:** Enhances precision by passing top candidates through `BAAI/bge-reranker-large`.
3. **Document Ingestion Engine:** Configurable text chunking (default 500 tokens / 50 overlap) with automated batch vector embedding generation and JSONB metadata tagging.
4. **Real-Time Streaming UI:** Next.js frontend featuring live SSE token streaming, retrieved context inspectors (`<details>`), and an integrated Document Ingestion panel.
5. **Centralized State Management:** Unified `ChatContext` managing both chat interactions and document upload/ingestion state.

---

## 📁 Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI entrypoint, lifespan, DB pool, and endpoints
│   │   └── ...
│   ├── requirements.txt       # Python dependencies (fastapi, asyncpg, pgvector, etc.)
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Main chat & document ingestion dashboard
│   │   ├── api/
│   │   │   ├── chat/route.ts  # Next.js API proxy for streaming chat
│   │   │   └── ingest/route.ts# Next.js API proxy for document ingestion
│   │   └── ...
│   ├── context/
│   │   └── ChatContext.tsx    # Centralized React Context state provider
│   └── package.json
└── docker-compose.yml
```

---

## 🚀 Getting Started

### 1. Prerequisites
* Docker & Docker Compose
* Node.js 18+ (for local frontend development)
* Python 3.12+ (for local backend development)

### 2. Environment Variables
Create environment files in your respective project directories:

**Backend (`backend/.env`):**
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rag_db
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

**Frontend (`frontend/.env.local`):**
```env
BACKEND_URL=http://localhost:8000
```

### 3. Running with Docker Compose
To spin up PostgreSQL (`pgvector`), FastAPI, and Next.js together:
```bash
docker-compose up --build
```

---

## 📊 Database Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding VECTOR(384),
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE INDEX IF NOT EXISTS idx_documents_fts ON documents USING gin(search_vector);
```

---

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
