# System Architecture
## Distill — Technical Design Document
**Version:** 0.3
**References:** prd.md

---

## 1. Core Design Principles

1. **Local-first architecture**: Next.js (localhost:3000) + FastAPI (localhost:8000) + Ollama + Neon Postgres. No cloud deployment in MVP. Both PC (RTX 5060 Ti) and MacBook M3 Pro are first-class development/runtime environments.
2. **Cost-aware, task-aware routing**: Local Ollama models are preferred for cost and privacy. Cloud LLMs (gpt-4o-mini, claude-haiku) serve as automatic fallback when local hardware is unavailable. The routing decision is made per task type.
3. **Single task router**: All AI calls go through `task_router.py`. No direct LiteLLM or OpenAI calls elsewhere in the codebase. This is the only file that knows about model names, providers, or routing rules.
4. **Embedding consistency**: Query embeddings and document embeddings MUST use the same model. The `embed()` function in `task_router.py` is the single enforcement point.
5. **Not everything is AI**: Chunking and topic clustering (cosine math) are deterministic algorithms with zero LLM cost. Only summarization, RAG answering, quality scoring, and topic tagging require a model call.
6. **Two capture modes**: "Learn Now" bypasses the digest and goes directly to KB. "Consume Later" queues for batch digest processing.

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│   Next.js (localhost:3000)                                          │
│   Dashboard · Capture Form · KB/RAG UI                              │
│   Proxies all API calls to FastAPI                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP (localhost)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FASTAPI BACKEND (localhost:8000)                                    │
│                                                                      │
│  POST  /api/articles                — Capture URL (learn_now or consume_later) │
│  POST  /api/articles/batch          — Batch capture (max 50 URLs)             │
│  GET   /api/articles                — List articles by mode/status            │
│  GET   /api/articles/indexing-status — Learn Now progress                     │
│  POST  /api/digests/process         — Trigger on-demand digest processing     │
│  GET   /api/digests?before_date=    — Get clusters (cursor-paginated)         │
│  GET   /api/digests/processing-status — Digest processing progress            │
│  PATCH /api/digests/{id}            — Update cluster status (done, etc.)      │
│  POST  /api/digests/{id}/promote    — Learn this → embed to KB               │
│  POST  /api/knowledge/query         — RAG natural language query              │
│  GET   /api/knowledge               — List knowledge base items              │
│  GET   /api/stats                   — LLM usage stats (costs, tokens, calls) │
│  GET   /api/llm-status              — Current LLM provider status            │
│  GET  /health             — Health check                             │
│                                                                      │
│    ┌─────────────────────────────┐                                   │
│    │   task_router.py            │                                   │
│    │   (single AI dispatch point) │                                  │
│    └──────────┬──────────────────┘                                   │
│               │                                                      │
└───────────────┼──────────────────────────────────────────────────────┘
                │
   ┌────────────┼──────────────────────┐
   │  LLM TIER  │                      │
   │            ▼                      │
   │  LOCAL (Ollama)    CLOUD (Fallback)│
   │  ┌──────────────┐ ┌─────────────┐│
   │  │ chat-heavy   │ │ gpt-4o-mini ││
   │  │ qwen2.5:14b  │ │ (summarize, ││
   │  │ PC·RTX 5060Ti│ │  RAG)       ││
   │  ├──────────────┤ ├─────────────┤│
   │  │ chat-light   │ │claude-haiku ││
   │  │ llama3.1:8b  │ │ -3.5        ││
   │  │ Mac·M3 Pro   │ │(rate backup)││
   │  ├──────────────┤ ├─────────────┤│
   │  │ embedder     │ │text-embed-  ││
   │  │nomic-embed-  │ │3-small      ││
   │  │text          │ │(768d)       ││
   │  └──────────────┘ └─────────────┘│
   └───────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                DATA LAYER (Neon Postgres — always-on)                │
│                                                                      │
│  articles / clusters / cluster_sources / llm_usage                   │
│  knowledge_items / embeddings (pgvector 768d HNSW index)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Task Router Design

All AI calls are dispatched through a single module. This is the **only file that knows about models and providers**.

### 3.1 Task Classification

| Task | Router Function | Model Tier | LLM Needed? |
|---|---|---|---|
| Article summarization | `summarize()` | chat-heavy | Yes |
| RAG answer generation | `rag_answer()` | chat-heavy | Yes |
| Summary quality gate | `score_quality()` | chat-light | Yes |
| Topic auto-tagging | `tag_topics()` | chat-light | Yes |
| Document/chunk embedding | `embed()` | embedder | No chat LLM |
| RAG query embedding | `embed()` | embedder | No chat LLM |
| Text chunking | `chunk_text()` | — | No LLM at all |
| Topic clustering | cosine similarity math | — | No LLM at all |

### 3.2 Routing Logic

```
RUNTIME_ENV=local-pc  →  chat-heavy: qwen2.5:14b (Ollama)
                          chat-light: llama3.1:8b (Ollama)
                          embedder:   nomic-embed-text (Ollama)
                          ↓ fallback if Ollama unreachable
                          chat-heavy: gpt-4o-mini
                          chat-light: gpt-4o-mini
                          embedder:   text-embedding-3-small (dimensions=768)

RUNTIME_ENV=local-mac →  chat-heavy: llama3.1:8b (Ollama)
                          chat-light: llama3.1:8b (Ollama)
                          embedder:   nomic-embed-text (Ollama)
                          ↓ fallback if Ollama unreachable
                          (same cloud fallbacks)
```

### 3.3 Quality Gate Flow (Post-MVP)

```
summarize(article_text)
    └── local model generates summary
          └── score_quality(summary) → int 1-10
                ├── score >= 7 → accept, write to DB
                └── score < 7  → re-call summarize() via cloud model
```

### 3.4 Critical Constraint: Embedding Consistency

```
nomic-embed-text       → 768 dimensions (local default)
text-embedding-3-small → 768 dimensions (cloud fallback, using dimensions=768 param)

The embed() function MUST be called for both document indexing
and query embedding. Using different models produces incompatible
vector spaces — cosine similarity returns garbage.

Enforced by: single embed() entry point in task_router.py
```

---

## 4. Content Ingestion Pipelines

### 4.1 Consume Later Pipeline

```
URL submitted with mode=consume_later
    → httpx fetch HTML
    → readability-lxml clean text extraction
    → INSERT articles (status=queued, mode=consume_later, content_type=article)
    → Paywall check: clean_text < 200 words → extraction_quality=low
    → [On-demand or nightly batch]
        → chunk_text()             [no LLM]
        → summarize()              [chat-heavy]
        → tag_topics()             [chat-light]
        → embed(headline)          [embedder] ← for clustering only
        → cluster assignment       [cosine math, no LLM]
        → write digest clusters to DB
        → mark articles status=ready
```

### 4.2 Learn Now Pipeline

```
URL submitted with mode=learn_now
    → httpx fetch HTML
    → readability-lxml clean text extraction
    → INSERT articles (status=queued, mode=learn_now)
    → chunk_text(clean_text)       [no LLM]
    → embed(chunks)                [embedder]
    → INSERT knowledge_items + embeddings [Neon]
    → UPDATE article status=kb_indexed
```

### 4.3 "Learn This" Promotion Pipeline

```
User clicks [Learn this] on digest cluster
    → POST /api/digests/{id}/promote
    → fetch full clean_text from articles in cluster
    → chunk_text(clean_text)               [no LLM]
    → embed(chunks)                        [embedder]
    → INSERT knowledge_items + embeddings  [Neon]
    → UPDATE cluster SET status=promoted
```

### 4.4 RAG Query Pipeline

```
User submits question
    → POST /api/knowledge/query {question}
    → embed(question)                      [embedder — SAME model as docs]
    → pgvector: SELECT chunks ORDER BY embedding <=> query_vec LIMIT 5
    → rag_answer(question, context_chunks) [chat-heavy]
    → return {answer, citations[{chunk_text, source_title, source_url}]}
```

---

## 5. Data Model

### 5.1 `articles` table
```sql
CREATE TABLE articles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url                 TEXT NOT NULL,
  url_hash            TEXT UNIQUE NOT NULL,
  title               TEXT,
  raw_html            TEXT,
  clean_text          TEXT,
  content_type        TEXT NOT NULL DEFAULT 'article',  -- 'article' | 'video' (future)
  mode                TEXT NOT NULL,                     -- 'consume_later' | 'learn_now'
  status              TEXT NOT NULL DEFAULT 'queued',    -- queued|processing|ready|done|promoted|kb_indexed
  extraction_quality  TEXT DEFAULT 'ok',                 -- 'ok' | 'low'
  source_domain       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  processed_at        TIMESTAMPTZ
);
```

### 5.2 `clusters` table
```sql
CREATE TABLE clusters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date     DATE NOT NULL,
  title           TEXT NOT NULL,
  headline        TEXT NOT NULL,
  summary         TEXT NOT NULL,
  bullets         JSONB NOT NULL,
  quotes          JSONB,
  topic_tags      TEXT[],
  source_count    INT DEFAULT 1,
  is_merged       BOOLEAN DEFAULT FALSE,
  status          TEXT DEFAULT 'unread',   -- unread | done | promoted | snoozed
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.3 `cluster_sources` table
```sql
CREATE TABLE cluster_sources (
  cluster_id    UUID REFERENCES clusters(id) ON DELETE CASCADE,
  article_id    UUID REFERENCES articles(id),
  source_url    TEXT NOT NULL,
  source_name   TEXT,
  content_type  TEXT NOT NULL DEFAULT 'article',
  PRIMARY KEY (cluster_id, article_id)
);
```

### 5.4 `knowledge_items` table
```sql
CREATE TABLE knowledge_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type  TEXT NOT NULL,   -- 'article' | 'digest_cluster' | 'document' (future)
  source_id    UUID,
  title        TEXT NOT NULL,
  url          TEXT,
  topic_tags   TEXT[],
  full_text    TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### 5.5 `embeddings` table (pgvector)
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_item_id UUID REFERENCES knowledge_items(id) ON DELETE CASCADE,
  chunk_index       INT NOT NULL,
  chunk_text        TEXT NOT NULL,
  embedding         VECTOR(768),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### 5.6 `llm_usage` table
```sql
CREATE TABLE llm_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type     TEXT NOT NULL,      -- embed, summarize, tag_topics, score_quality, rag_answer
  model         TEXT NOT NULL,      -- e.g. ollama/qwen2.5:14b, gpt-4o-mini
  provider      TEXT NOT NULL,      -- local | cloud
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd      FLOAT NOT NULL DEFAULT 0.0,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. Deployment Environments

| Env | LLM | Embed | Notes |
|---|---|---|---|
| `local-pc` | qwen2.5:14b (Ollama) | nomic-embed-text | Primary processing env |
| `local-mac` | llama3.1:8b (Ollama) | nomic-embed-text | Lighter model due to 16GB RAM |

**Neon Postgres** is shared across both environments. Both envs read/write to the same DB.

Cloud deployment (Vercel + Render) deferred to future phase.

---

## 7. API Endpoints

All endpoints are on FastAPI (localhost:8000). Next.js proxies API calls to FastAPI.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (db, ollama, env status) |
| `POST` | `/api/articles` | Capture single URL with mode (learn_now / consume_later) |
| `POST` | `/api/articles/batch` | Batch capture (max 50 URLs) |
| `GET` | `/api/articles` | List articles split by mode (consume_later / learn_now) |
| `GET` | `/api/articles/indexing-status` | Learn Now processing progress |
| `POST` | `/api/digests/process` | Trigger on-demand digest processing |
| `GET` | `/api/digests?before_date=` | Get clusters, cursor-paginated (most recent first) |
| `GET` | `/api/digests/processing-status` | Digest processing progress |
| `PATCH` | `/api/digests/{id}` | Update cluster status (done, unread) |
| `POST` | `/api/digests/{id}/promote` | Learn this → embed cluster to KB |
| `POST` | `/api/knowledge/query` | RAG natural language query |
| `GET` | `/api/knowledge` | List knowledge base items |
| `GET` | `/api/stats` | LLM usage stats (costs, tokens, calls) |
| `GET` | `/api/llm-status` | Current LLM provider status (local/cloud, active) |

---

## 8. State Machines

### Consume Later Article
```
queued → processing → ready → done
                            → promoted (via "Learn this")
```

### Learn Now Article
```
queued → kb_indexed
```

### Cluster
```
unread → done
       → promoted (via "Learn this")
       → snoozed (re-appears next day)
```
