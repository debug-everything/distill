# Implementation Plan
## Distill — Phased Build Roadmap
**Version:** 0.3
**References:** prd.md, architecture.md, tech_stack.md

---

## Phase Overview

| Phase | Name | Goal | Est. Effort |
|---|---|---|---|
| 0 | Foundation | Repo, DB, Ollama verified, task router, scaffolds running | 2 days |
| 1 | Consume Later Pipeline | URL capture → on-demand/batch process → digest dashboard | 5-6 days |
| 2 | Learn Now + RAG | Learn Now direct-to-KB, Learn This promotion, RAG query | 3-4 days |
| 3 | Polish | Quality gate, snooze, cost tracking, loading states | 2-3 days |
| 4 | YouTube Support | Video transcript extraction in both modes | 3-4 days |
| 5 | PDF/DOCX | Document ingestion CLI + web upload | 3-4 days |

---

## Phase 0 — Foundation
**Goal:** Repo, DB, Ollama verified, task router, scaffolds running on both machines.

### Tasks
- Init monorepo: `/backend` (FastAPI), `/frontend` (Next.js), `/docs`
- `/backend`: `uv` project with deps (fastapi, uvicorn, httpx, litellm, sqlalchemy[asyncio], asyncpg, pgvector-python, alembic, readability-lxml, langchain-text-splitters, apscheduler, pydantic)
- `/frontend`: `pnpm` Next.js with tailwind, shadcn/ui, zustand, @tanstack/react-query, lucide-react
- Env config: `.env.local-pc`, `.env.local-mac`, `.env.example`
- Neon Postgres project + connection strings
- Alembic migration: all tables (`articles`, `clusters`, `cluster_sources`, `knowledge_items`, `embeddings`) + pgvector + HNSW index
- Ollama on both machines with required models
- `backend/app/core/task_router.py` skeleton: `embed()`, `summarize()`, `score_quality()`, `tag_topics()`, `rag_answer()`
- Smoke tests: `embed()` returns 768d vector, `summarize()` uses local model
- FastAPI `GET /health` endpoint
- Next.js scaffold calling `/health`
- CORS configured (localhost:3000 → localhost:8000)

### Key Files
- `backend/app/core/task_router.py`
- `backend/app/main.py`
- `backend/alembic/versions/001_initial_schema.py`
- `frontend/src/app/page.tsx`

### Done When
- `/health` works from both machines
- `embed()` + `summarize()` work locally and fall back to cloud when Ollama stopped

---

## Phase 1 — Consume Later Pipeline
**Goal:** Paste article URL → queue → process on-demand → read digest dashboard.

### 1A — Capture
- `POST /api/capture` (FastAPI): accepts `{ url, mode }`, dedup via SHA256, insert article
- `ArticleExtractor`: httpx fetch → readability-lxml → clean_text (at capture time)
- Paywall detection: clean_text < 200 words → `extraction_quality=low`
- Frontend: URL input + `[Read Later]` button + queue list

### 1B — Processing (on-demand + batch)
- `POST /api/digest/process` (FastAPI): fetches queued consume_later items
- Pipeline: chunk_text → summarize → tag_topics → embed(headline) → cosine clustering → write clusters
- APScheduler nightly sweep (same logic, auto-triggered)
- Frontend: `[Process Now]` button with processing status
- Race condition guard: `SELECT FOR UPDATE SKIP LOCKED` or in-memory lock

### 1C — Digest Dashboard
- `GET /api/digest` returns today's clusters
- Level 0: card grid (title, headline, source count, topic tags)
- Level 1: side drawer (bullets + source list)
- Level 2: Highlights / Quotes tabs
- `[Done]` archives cluster
- Topic filter pills (client-side)
- Date picker for digest history
- Responsive: all views work on mobile

### Done When
- Paste URL → Process Now → cluster in dashboard with summaries
- Nightly batch also processes unhandled items
- Works on phone viewport

---

## Phase 2 — Learn Now + RAG
**Goal:** "Learn Now" direct-to-KB works. RAG query works against KB content.

### 2A — Learn Now
- Extend `POST /api/capture` for `mode=learn_now`: extract → chunk → embed → KB
- Article status goes `queued → kb_indexed` (skips digest)
- Frontend: `[Learn Now]` button with inline progress

### 2B — "Learn This" Promotion
- `POST /api/digest/{id}/promote`: fetch cluster articles → chunk → embed → KB
- Frontend: `[Learn This]` button on digest drawer

### 2C — RAG Query
- `POST /api/rag/query`: embed(question) → pgvector top-5 → rag_answer → citations
- Frontend: KB page with question input, answer + `[1][2]` citations, source cards
- Related questions suggestions
- Responsive KB page

### Done When
- Learn Now URL → appears in KB → RAG query finds it
- Promoted digest cluster → RAG query finds it

---

## Phase 3 — Polish
- Quality gate: score_quality < 7 → cloud re-route
- Snooze 1 day on digest clusters
- Cost tracker: log LLM usage per call → `/api/stats`
- Paywall warning badge
- Loading states for all async ops

---

## Phase 4 — YouTube Support
- Detect YouTube URL → youtube-transcript-api → transcript
- Works in both Learn Now and Consume Later modes
- Videos can cluster with articles on same topic
- Video badges + thumbnails in UI

---

## Phase 5 — PDF/DOCX
- `scripts/ingest_doc.py` CLI: PyMuPDF / python-docx → chunk → embed → KB
- Web upload form alternative
- Document sources in RAG results

---

## Future Phases (not planned in detail)
- Phase 6: Cloud deployment (Vercel + Render)
- Phase 7: Browser extension (Learn Now / Read Later buttons)

---

## Build Order (2-week target for Phases 0-3)

```
Week 1:
  Day 1-2  → Phase 0: foundation
  Day 3    → Phase 1A: capture + extraction
  Day 4-5  → Phase 1B: digest pipeline
  Day 6-7  → Phase 1C: dashboard UI

Week 2:
  Day 8-9  → Phase 2A+2B: Learn Now + Learn This
  Day 10-11 → Phase 2C: RAG query + KB UI
  Day 12   → Phase 3: quality gate, snooze, stats
  Day 13-14 → Buffer / polish / real content testing
```

---

## Verification

After each phase:
1. Manual test the happy path end-to-end
2. Test on both desktop and mobile viewport
3. Test with Ollama running (local model) and stopped (cloud fallback)
4. Verify Neon data is correct (use TablePlus)
