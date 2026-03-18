# Tech Stack Recommendations
## Distill - Library & Tooling Decisions
**Version:** 0.3
**References:** architecture.md

> Key constraint: embedding model must be consistent across all envs. Lock it early.

---

## Frontend (Next.js, localhost:3000)

| Concern | Recommendation | Rationale |
|---|---|---|
| Framework | **Next.js 14** (App Router) | File-based routing; proxies API calls to FastAPI |
| Styling | **Tailwind CSS** | Utility-first; no CSS specificity battles |
| UI Components | **shadcn/ui** | Copy-paste Tailwind-native components; drawer, tabs, badges built-in |
| State | **Zustand** | Lightweight; no Redux overhead for single-user tool |
| Data fetching | **TanStack Query** | Caching + loading states for digest and RAG endpoints |
| Icons | **Lucide React** | Clean, consistent |

---

## Backend (FastAPI, localhost:8000)

| Concern | Recommendation | Rationale |
|---|---|---|
| Framework | **FastAPI** | Async Python; auto OpenAPI docs; Pydantic v2 native |
| Scheduler | **APScheduler** (embedded) | No separate worker for MVP; runs inside FastAPI process |
| HTTP client | **httpx** (async) | Async article fetching; handles redirects and timeouts cleanly |
| HTML extraction | **readability-lxml** | Mozilla Readability port; strips ads/nav reliably |
| Text chunking | **langchain-text-splitters** | `RecursiveCharacterTextSplitter`; respects paragraph/sentence boundaries |
| Data validation | **Pydantic v2** | LLM output parsing; catches malformed JSON from models |
| ORM | **SQLAlchemy 2.0** (async) | Async Postgres; works with pgvector-python extension |
| Migrations | **Alembic** | SQLAlchemy-native schema versioning |
| Vector support | **pgvector-python** | SQLAlchemy integration for vector columns |

---

## AI / LLM Task Router

All AI calls go through `app/core/task_router.py`. No direct model calls elsewhere.

| Concern | Recommendation | Rationale |
|---|---|---|
| LLM abstraction | **LiteLLM** | Single OpenAI-compatible interface for Ollama + OpenAI + Anthropic |
| Local LLM runtime | **Ollama** | Simplest local model management; REST API on localhost:11434 |
| **chat-heavy** (summarize, RAG) | `qwen2.5:14b` (PC) / `llama3.1:8b` (Mac) | Best instruction-following at respective hardware limits |
| **chat-light** (quality score, tagging) | `llama3.1:8b` (PC+Mac) | Fast, cheap; lightweight tasks don't need 14B |
| **embedder** (all embedding) | `nomic-embed-text` via Ollama | 768d; free; strong RAG benchmark scores |
| Cloud chat primary | **cohere/command-r** (Cohere) | Strong RAG/summarization; free tier available |
| Cloud chat fallback | **gpt-4o-mini** (OpenAI) | Best cost/quality for summarization; ~$0.15/1M input tokens |
| Cloud chat fallback 2 | **claude-haiku-3.5** (Anthropic) | Rate-limit backup; fast and cheap |
| Cloud embed fallback | **text-embedding-3-small** (OpenAI) | Configured to output 768d via `dimensions` parameter |
| Topic clustering | Cosine similarity math (numpy/scipy) | Zero LLM cost; purely mathematical on existing embeddings |

### Embedding Dimension Lock
```
nomic-embed-text       → 768 dimensions (local default)
text-embedding-3-small → 768 dimensions (cloud fallback, dimensions=768)

Both providers produce compatible 768d vectors.
Lock EMBED_MODEL env var. Never split across environments.
```

---

## Database

| Concern | Recommendation | Rationale |
|---|---|---|
| Primary DB | **Postgres + pgvector** | Local Docker (`pgvector/pgvector:pg17`) or any cloud-hosted Postgres |
| Vector search | **pgvector** (HNSW index) | Avoids separate vector DB; JOINs with metadata work natively |
| Connection | `asyncpg` via SQLAlchemy | SSL auto-enabled when URL contains "neon" or similar cloud patterns |
| pgvector client | **pgvector-python** | SQLAlchemy integration for vector columns |

---

## Infrastructure & Deployment

| Concern | Recommendation | Rationale |
|---|---|---|
| Frontend | **Next.js on localhost:3000** | Proxies all API calls to FastAPI backend |
| Backend | **FastAPI on localhost:8000** | All processing, AI routing, DB access |
| Local AI | **Ollama on localhost:11434** | Local model management |
| Database | **Postgres + pgvector** | Local Docker or cloud-hosted, shared across envs |

Cloud deployment (Vercel + Render) deferred to future phase.

### Environment Variables

```bash
# Set in .env.local-pc, .env.local-mac respectively
RUNTIME_ENV=local-pc          # local-pc | local-mac

# Local AI
OLLAMA_BASE_URL=http://localhost:11434
LOCAL_CHAT_HEAVY=qwen2.5:14b  # override to llama3.1:8b on mac
LOCAL_CHAT_LIGHT=llama3.1:8b
LOCAL_EMBED_MODEL=nomic-embed-text

# Cloud fallback chain (tried in order; only used when Ollama unavailable)
CO_API_KEY=...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
CLOUD_CHAT_MODEL=cohere/command-r
CLOUD_CHAT_FALLBACK=gpt-4o-mini
CLOUD_CHAT_FALLBACK_2=claude-haiku-3-5
CLOUD_EMBED_MODEL=text-embedding-3-small

# Database (local Docker or cloud-hosted Postgres)
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/distill
```

---

## Dev Tooling

| Concern | Recommendation | Rationale |
|---|---|---|
| Python package manager | **uv** | 10-100x faster than pip; lockfile support |
| JS package manager | **pnpm** | Faster than npm; disk-efficient |
| Python linting | **ruff** | Replaces flake8 + black; single tool |
| API testing | **Bruno** | Open-source Postman alternative |
| DB GUI | **TablePlus** | Clean Postgres inspection |

---

## Considered & Deliberately Excluded

| Tool | Why Excluded |
|---|---|
| LangChain / LlamaIndex | Direct LiteLLM + prompt templates keeps you closer to the metal; better for learning |
| Qdrant / Chroma / Pinecone | pgvector covers all MVP needs; avoids a second service |
| Celery + Redis | APScheduler sufficient for single-user batch |
| Supabase | Plain Postgres is simpler for this use case |
