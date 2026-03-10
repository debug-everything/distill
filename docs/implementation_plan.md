# Implementation Plan
## Distill — Phased Build Roadmap
**Version:** 0.4
**References:** prd.md, architecture.md, tech_stack.md

---

## Phase Overview

| Phase | Name | Status | Goal |
|---|---|---|---|
| 0 | Foundation | DONE | Repo, DB, Ollama verified, task router, scaffolds running |
| 1 | Consume Later Pipeline | MOSTLY DONE | URL capture → on-demand/batch process → digest dashboard |
| 2 | Learn Now + RAG | DONE | Learn Now direct-to-KB, Learn This promotion, RAG query |
| 3 | Polish | NOT STARTED | Quality gate, snooze, cost tracking, loading states |
| 4 | YouTube Support | DONE | Video transcript extraction in both modes |
| 5 | PDF/DOCX | NOT STARTED | Document ingestion CLI + web upload |

---

## Phase 0 — Foundation — DONE

### Tasks
- [x] Init monorepo: `/backend` (FastAPI), `/frontend` (Next.js), `/docs`
- [x] `/backend`: `uv` project with all deps
- [x] `/frontend`: `pnpm` Next.js with tailwind, shadcn/ui, zustand, @tanstack/react-query, lucide-react
- [x] Env config: `.env.example`, single `.env` at repo root
- [x] Neon Postgres project + connection strings
- [x] Alembic migration: all tables + pgvector + HNSW index
- [x] `backend/app/core/task_router.py`: `embed()`, `summarize()`, `score_quality()`, `tag_topics()`, `rag_answer()`
- [x] FastAPI `GET /health` endpoint (checks DB + Ollama)
- [x] Next.js scaffold calling `/health`
- [x] CORS configured, API proxy via `next.config.ts` rewrites
- [x] `truststore` for macOS SSL certificate handling

---

## Phase 1 — Consume Later Pipeline — MOSTLY DONE

### 1A — Capture — DONE
- [x] `POST /api/capture`: accepts `{ url, mode }`, dedup via SHA256, insert article
- [x] `POST /api/capture/batch`: multi-URL capture (up to 50)
- [x] `ArticleExtractor`: httpx fetch → readability-lxml → clean_text + og:image extraction
- [x] Paywall detection: clean_text < 200 words → `extraction_quality=low`
- [x] Frontend: textarea input (single or multi-line URLs), Learn Now / Read Later buttons, queue list

### 1B — Processing — MOSTLY DONE
- [x] `POST /api/digest/process`: background asyncio task (no timeout)
- [x] Pipeline: chunk_text → summarize → tag_topics → embed(headline) → cosine clustering → write clusters
- [x] Frontend: Process Now button with live progress polling
- [x] Race condition guard: in-memory asyncio lock
- [ ] APScheduler nightly sweep (deferred — low priority for single-user)

### 1C — Digest Dashboard — DONE
- [x] `GET /api/digest` returns clusters for a date
- [x] Tile content formats: default (title + clipped summary + thumbnail), compact, minimal
- [x] Tile layouts: vertical list, 2-column grid (desktop only)
- [x] Reading modal (Dialog) with Summary / Quotes / Sources tabs
- [x] `[Done]` archives cluster
- [x] Topic filter pills (client-side)
- [x] Date navigation (prev/next day)
- [x] Responsive: all views work on mobile
- [x] Display settings persisted via Zustand

### Extras built during Phase 1
- [x] Shared Navbar with active route highlighting
- [x] Theme toggle (light/dark/system) with ThemeProvider
- [x] Text size toggle (sm/base/lg) applied globally
- [x] `image_url` on Article + ClusterSource (og:image extraction, migration applied)
- [x] RESTful API refactor: resource-oriented URLs, PATCH for status updates
- [x] Reading settings popover (Apple Books-style): font family (sans/Lora/Source Serif), line spacing (compact/normal/relaxed), text size, theme
- [x] LLM mode env config: `LLM_MODE_LIGHT` and `LLM_MODE_HEAVY` (auto/cloud/local)
- [x] LLM provider indicator in navbar: Monitor (green) for local, Cloud (amber) for paid — pulses while active, fades when idle
- [x] RAG query shows which LLM answered (local vs cloud badge)

---

## Phase 2 — Learn Now + RAG — DONE

### 2A — Learn Now — DONE
- [x] `knowledge_service.py`: chunk → tag_topics → embed → KnowledgeItem + Embeddings
- [x] `POST /api/capture` with `mode=learn_now`: extract → index to KB immediately
- [x] Article status goes `queued → kb_indexed`
- [x] Frontend: Learn Now button triggers full pipeline at capture time

### 2B — "Learn This" Promotion — DONE
- [x] `POST /api/digest/{id}/promote`: fetch cluster articles → chunk → embed → KB
- [x] Cluster status set to `promoted`
- [x] Frontend: Learn This button in reading modal with loading/success/error states

### 2C — RAG Query — DONE
- [x] `POST /api/rag/query`: embed(question) → pgvector top-5 → rag_answer → citations
- [x] `GET /api/kb`: list all knowledge base items with chunk counts
- [x] Frontend: `/knowledge` page with question input, answer card, deduplicated source citations, related questions
- [x] Knowledge nav link enabled

---

## Phase 3 — Polish — NOT STARTED
- [ ] Quality gate: score_quality < 7 → cloud re-route
- [ ] Snooze 1 day on digest clusters
- [ ] Cost tracker: log LLM usage per call → `/api/stats`
- [ ] Paywall warning badge
- [ ] Loading states for all async ops

---

## Phase 4 — YouTube Support — DONE
- [x] Refactored extraction: `content_extractor.py` factory → `article_extractor.py` / `video_extractor.py` (strategy pattern)
- [x] YouTube URL detection (youtube.com/watch, youtu.be, youtube.com/shorts)
- [x] Transcript extraction via `youtube-transcript-api` v1.x (manual preferred, auto-generated fallback)
- [x] Title via oembed, thumbnail via predictable YouTube URL pattern (no API key)
- [x] `extraction_quality`: "ok" (manual), "auto-transcript" (auto-generated), "low" (< 100 words)
- [x] `content_type` = "video" stored on Article, passed through to queue API
- [x] Works in both Learn Now and Consume Later modes (no pipeline changes needed)
- [x] Videos cluster with articles naturally (same headline embedding)
- [x] Video badge + auto-transcript badge on queue items (both sections)
- [x] Thumbnails already supported via `image_url`

---

## Phase 5 — PDF/DOCX — NOT STARTED
- [ ] `scripts/ingest_doc.py` CLI: PyMuPDF / python-docx → chunk → embed → KB
- [ ] Web upload form alternative
- [ ] Document sources in RAG results

---

## Future Phases (not planned in detail)
- Phase 6: Cloud deployment (Vercel + Render)
- Phase 7: Browser extension (Learn Now / Read Later buttons)

---

## Ideas (unhashed — needs design)

### Customizable Summarization + Progressive Expansion
- **System-level default depth**: User-configurable summary verbosity (concise / standard / detailed) — affects digest processing output
- Configurable bullet point count (currently hardcoded to 3)
- Settings stored client-side (Zustand) and sent as params to summarize pipeline
- **On-demand expansion** ("Expand Summary" in reading modal): progressive disclosure for individual clusters
  - User reads concise summary → clicks Expand → LLM generates detailed summary with sections of interest
  - Inspired by Chrome/Edge built-in summarization UX
  - Cache expanded summaries in JSONB on `clusters` table (e.g., `summaries: { concise, detailed }`) — avoid re-generating on re-open
  - **Cost control**: local LLM only by default; no cloud fallback unless explicitly configured
  - **Short content guard**: disable expansion when source article is too short to produce a meaningfully deeper summary (tentatively ~500 words min; also auto-disable for `extraction_quality=low` articles)
  - Open question: how many expansion levels? Two (concise → detailed) is probably enough

### Focused Topics
- User maintains a list of "focused topics" (e.g., "agentic commerce", "US stocks")
- Summarization prompt weighs these topics more heavily — summaries lean toward user interests
- Quote extraction also prioritizes focused topics
- Settings page or inline config for managing the topic list
- Open question: should focused topics also influence clustering/ordering?

### Content Evaluation Scores (configurable, off by default)
- Toggle per-article LLM evaluation during digest processing
- **Interest match score**: How well content matches user's focused topics list (ties into Focused Topics feature)
- **Usefulness score**: Actionability and novelty of the content
- **Truthfulness score**: Deferred — requires retrieval-based verification to be reliable, not just LLM self-grading
- Should run on local LLM only by default (cost: ~$0.005/article on cloud)
- Scores displayed on digest tiles as subtle indicators

### Agentic AI & Workflow Patterns
- Audit codebase for opportunities to apply AI workflow patterns (chain-of-thought, reflection, tool use, planning, evaluation loops)
- Refactor existing AI pipelines (summarization, RAG, topic tagging) to leverage applicable patterns
- Examples: multi-step summarization with self-critique, agentic RAG with query decomposition, quality scoring with reflection

### Chat with External LLM ("Discuss This")
- Button inside digest reading modal to continue exploring a topic via an external chat platform
- Context to send: digest summary + bullet points + source URLs (not full article text — too long)
- **Platform deep-link support (as of early 2025):**
  - **ChatGPT**: No official URL scheme to pre-fill a new chat with context
  - **Claude**: No deep-link API for initiating a chat with payload
  - **Perplexity**: No known pre-fill URL, but search queries work via `perplexity.ai/search?q=`
- **Practical approaches to evaluate:**
  1. **Copy-to-clipboard**: Format context as markdown, user pastes into their preferred chat. Lowest friction, works everywhere.
  2. **In-app chat**: Use OpenAI/Anthropic API directly within Distill to continue the conversation (adds cost, but keeps context in-app).
  3. **Perplexity search link**: Open `perplexity.ai/search?q={encoded question about topic}` — loses full context but good for research follow-up.
- Open question: which approach best fits the workflow? Could offer multiple ("Copy context" + "Ask in Distill" + "Search Perplexity").

---

## Verification

After each phase:
1. Manual test the happy path end-to-end
2. Test on both desktop and mobile viewport
3. Test with Ollama running (local model) and stopped (cloud fallback)
4. Verify Neon data is correct (use TablePlus)
