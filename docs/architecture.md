# System Architecture
## Distill - Technical Design Document
**Version:** 0.3
**References:** prd.md

---

## 1. Core Design Principles

1. **Local-first architecture**: Next.js (localhost:3000) + FastAPI (localhost:8000) + Ollama + Postgres (local Docker or any remote instance). No cloud deployment in MVP. Both PC (RTX 5060 Ti) and MacBook M3 Pro are first-class development/runtime environments.
2. **Cost-aware, task-aware routing**: Local Ollama models are preferred for cost and privacy. Cloud LLMs serve as automatic fallback with a configurable chain (cohere/command-r → gpt-4o-mini → claude-haiku-3.5). The routing decision is made per task type.
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
   │  LOCAL (Ollama)    CLOUD (Fallback Chain)    │
   │  ┌──────────────┐ ┌───────────────────────┐│
   │  │ chat-heavy   │ │ 1. cohere/command-r   ││
   │  │ qwen2.5:14b  │ │ 2. gpt-4o-mini       ││
   │  │ PC·RTX 5060Ti│ │ 3. claude-haiku-3.5   ││
   │  ├──────────────┤ ├───────────────────────┤│
   │  │ chat-light   │ │ (same fallback chain) ││
   │  │ llama3.1:8b  │ │                       ││
   │  │ Mac·M3 Pro   │ │                       ││
   │  ├──────────────┤ ├───────────────────────┤│
   │  │ embedder     │ │ text-embedding-3-small││
   │  │nomic-embed-  │ │ (768d)               ││
   │  │text          │ │                       ││
   │  └──────────────┘ └───────────────────────┘│
   └─────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                DATA LAYER (Postgres + pgvector)                      │
│                                                                      │
│  articles / clusters / cluster_sources / llm_usage / user_settings    │
│  feed_sources / feed_items                                           │
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
                          chat: cohere/command-r → gpt-4o-mini → claude-haiku-3.5
                          embedder: text-embedding-3-small (dimensions=768)

RUNTIME_ENV=local-mac →  chat-heavy: llama3.1:8b (Ollama)
                          chat-light: llama3.1:8b (Ollama)
                          embedder:   nomic-embed-text (Ollama)
                          ↓ fallback if Ollama unreachable
                          (same cloud fallback chain)
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
vector spaces, and cosine similarity returns garbage.

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
    → INSERT knowledge_items + embeddings
    → UPDATE article status=kb_indexed
```

### 4.3 "Learn This" Promotion Pipeline

```
User clicks [Learn this] on digest cluster
    → POST /api/digests/{id}/promote
    → fetch full clean_text from articles in cluster
    → chunk_text(clean_text)               [no LLM]
    → embed(chunks)                        [embedder]
    → INSERT knowledge_items + embeddings
    → UPDATE cluster SET status=promoted
```

### 4.4 Feed Pipeline (Newsletters + RSS Sources)

The feed system has two input paths that share the same processing and storage:

#### 4.4a Newsletter Fetch (Gmail IMAP)

```
On-demand "Fetch Newsletters" trigger
    → IMAP connect to dedicated Gmail (App Password auth)
    → Fetch unread emails since last fetch
    → For each email:
        → Parse HTML body → clean text
        → Split multi-item newsletters into individual entries
          (heuristic: heading/separator patterns, numbered items, HR tags)
        → For each split item:
            → summarize()                [chat-heavy]
            → tag_topics()               [chat-light]
            → INSERT feed_items (source_type='newsletter')
    → Mark Gmail messages as read (IMAP SEEN flag)
```

**Newsletter splitting strategy:**
Multi-item newsletters (TLDR, Morning Brew, etc.) use predictable structural
patterns: numbered headings, horizontal rules, bold titles followed by
descriptions. The parser uses a combination of HTML structure analysis
(h2/h3 tags, hr elements, repeated div patterns) and text heuristics
(numbered lists, "---" separators) to identify item boundaries. Single-topic
newsletters (e.g., a long-form essay) are kept as one item.

#### 4.4b RSS/YouTube Source Scan

```
On-demand "Scan Sources" trigger
    → For each configured feed_source:
        → feedparser fetch RSS/Atom feed
        → Take 25 most recent entries (cap per source per scan)
        → Dedup against existing feed_items by guid/url
        → For each new entry:
            → tag_topics(title + description)    [chat-light]
            → Compute topic_match_score (count of tags ∩ focused_topics)
            → INSERT feed_items (source_type='rss'|'youtube')
    → Feed page ranks: matched items first, then "Other" section
```

**Source auto-discovery:** When a user adds a source URL, the system attempts
to discover the RSS feed automatically:
- YouTube channel URL → convert to `youtube.com/feeds/videos.xml?channel_id=X`
- Blog/site URL → look for `<link rel="alternate" type="application/rss+xml">` in HTML
- Direct RSS/Atom URL → validate and use as-is

**No upfront summarization for RSS items.** Unlike newsletters (which arrive as
full-text HTML), RSS entries only have title + short description. Full
summarization happens when the user captures an item ("Add to Digest Queue" or
"Save to KB"), which triggers the existing article extraction + summarize pipeline.

### 4.5 RAG Query Pipeline

```
User submits question
    → POST /api/knowledge/query {question, history?}
    → embed(question)                      [embedder — SAME model as docs]
    → pgvector: SELECT chunks ORDER BY embedding <=> query_vec LIMIT 5
    → rag_answer(question, context_chunks, history?) [chat-heavy]
    → return {answer, citations[{chunk_text, source_title, source_url}]}
```

**Conversation history**: The client keeps an ephemeral array of Q&A pairs
(session-scoped, not persisted). On each query, recent history is sent with
the question. The backend trims to a ~4000-character budget (whole exchanges only,
walking backward, minimum 1 exchange) and injects into the `rag_answer()` prompt
as conversation context. This lets users ask follow-ups like "tell me more" or
"how does that compare?" without server-side session state.

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
  content_attributes  JSONB,                             -- extraction-time metadata (video demo cues, etc.)
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
  content_style   TEXT,                  -- tutorial|demo|opinion|interview|news|analysis|narrative|review
  information_density INT,              -- 1-10, how dense/actionable the content is
  content_attributes  JSONB,            -- merged extraction attributes (video demo cues, etc.)
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

### 5.6 `feed_sources` table
```sql
CREATE TABLE feed_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type   TEXT NOT NULL,              -- 'rss' | 'youtube' | 'newsletter'
  name          TEXT NOT NULL,              -- display name (e.g. "TechCrunch", "TLDR")
  url           TEXT,                       -- RSS/Atom feed URL (null for newsletter)
  config        JSONB,                      -- type-specific config (gmail address for newsletter, channel_id for youtube, etc.)
  last_fetched  TIMESTAMPTZ,
  item_count    INT DEFAULT 0,              -- total items fetched from this source
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);
-- For newsletter (Gmail): single row with source_type='newsletter', config={gmail_address}
-- For RSS: one row per feed, url=feed URL
-- For YouTube: one row per channel, url=YouTube RSS feed URL, config={channel_id, channel_name}
```

### 5.7 `feed_items` table
```sql
CREATE TABLE feed_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_source_id      UUID REFERENCES feed_sources(id) ON DELETE CASCADE,
  source_type         TEXT NOT NULL,            -- denormalized: 'rss' | 'youtube' | 'newsletter'
  guid                TEXT,                     -- RSS guid or email Message-ID, for dedup
  title               TEXT NOT NULL,
  content             TEXT,                     -- extracted clean text (full for newsletters, description for RSS)
  url                 TEXT,                     -- link to original article/video
  source_domain       TEXT,
  image_url           TEXT,                     -- thumbnail if available
  published_at        TIMESTAMPTZ,             -- original publish date from RSS/email
  -- Summarization fields (populated for newsletters; null for RSS until captured)
  summary             TEXT,
  bullets             JSONB,
  content_style       TEXT,
  information_density INT,
  -- Topic matching
  topic_tags          TEXT[],
  topic_match_score   INT DEFAULT 0,           -- count of tags ∩ focused_topics
  -- Display
  source_name         TEXT,                    -- denormalized (e.g. "TechCrunch", "TLDR")
  status              TEXT NOT NULL DEFAULT 'unread',  -- unread | read | archived | promoted
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX feed_items_dedup ON feed_items (feed_source_id, guid) WHERE guid IS NOT NULL;
```

### 5.8 `llm_usage` table
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

### 5.7 `user_settings` table
```sql
CREATE TABLE user_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
-- Single-user key-value store for server-side settings.
-- Used for: focused_topics (list of user interest topics injected into LLM prompts).
```

---

## 6. Deployment Environments

| Env | LLM | Embed | Notes |
|---|---|---|---|
| `local-pc` | qwen2.5:14b (Ollama) | nomic-embed-text | Primary processing env |
| `local-mac` | llama3.1:8b (Ollama) | nomic-embed-text | Lighter model due to 16GB RAM |

Postgres (local Docker or any remote instance) is shared across both environments. Both envs read/write to the same DB.

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
| `POST` | `/api/knowledge/query` | RAG query (accepts optional conversation history) |
| `GET` | `/api/knowledge` | List knowledge base items |
| `GET` | `/api/settings/focused-topics` | Get user's focused topics list |
| `PUT` | `/api/settings/focused-topics` | Set user's focused topics list (max 20) |
| `POST` | `/api/feed/fetch` | Trigger fetch (newsletters + RSS sources) |
| `GET` | `/api/feed` | List feed items (paginated, filterable by status/source_type) |
| `GET` | `/api/feed/fetch-status` | Fetch/processing progress |
| `PATCH` | `/api/feed/{id}` | Update feed item status (read, archived) |
| `POST` | `/api/feed/{id}/capture` | Capture feed item → digest queue or KB |
| `GET` | `/api/feed/sources` | List configured feed sources |
| `POST` | `/api/feed/sources` | Add feed source (auto-discovers RSS) |
| `POST` | `/api/feed/sources/detect` | Auto-detect source type and resolve RSS URL |
| `DELETE` | `/api/feed/sources/{id}` | Remove feed source |
| `POST` | `/api/feed/{id}/summarize` | On-demand summarize a feed item (cached) |
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

### Feed Item
```
unread → read
       → archived
       → captured (via "Add to Digest Queue" or "Save to KB")
```
