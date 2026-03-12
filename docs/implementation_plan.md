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
| 3 | Polish | IN PROGRESS | Quality gate, snooze, cost tracking, loading states |
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

## Phase 3 — Polish — IN PROGRESS
- [ ] Quality gate: score_quality < 7 → cloud re-route (deferred)
- [ ] Snooze 1 day on digest clusters (deferred)
- [x] Cost tracker: `llm_usage` table, in-memory buffer with 60s flush, `GET /api/stats` with totals/by-task/daily/recent aggregations, collapsible StatsCard on capture page
- [x] Paywall warning badge on digest tiles + modal sources (reuses `extraction_quality=low`)
- [x] Loading states: skeleton cards on Knowledge page, spinners on all buttons/mutations, progress bars on digest/learn-now processing

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

## Phase 5 — UX: Flow Clarity & Onboarding — DONE

The core problem: "Read Later", "Learn Now", "Process Now", and "Learn This" are not self-explanatory. Users must already understand the pipeline to use the page correctly.

### 5A — Rename actions with outcome, not mechanism
Current labels use abstract metaphors. Renamed to describe the destination:
- [x] "Read Later" → **"Add to Digest Queue"** (says where it goes)
- [x] "Learn Now" → **"Save to Knowledge Base"** (says where it goes)
- [x] "Process Now" → **"Generate Digest"** (says what you get)
- [x] "Learn This" (in digest modal) → **"Save to Knowledge Base"** (consistent)
- [x] Updated placeholder: "Paste links (articles or YouTube, one per line)…"
- [x] Updated empty state text to reference new button labels

### 5B — Make the pipeline visible on Capture page
- [x] "Generate Digest" button surfaces directly below the queue list (prominent dashed-border CTA)
- [x] Post-capture feedback includes next step: `✓ Added "Title" · 3 in queue · [Generate Digest →]`
- [x] Queue CTA shows inline flow hint: `3 articles ready · Generate a digest to read summaries`
- [x] **Auto-redirect after processing**: Navigates to `/digest` on successful completion

### 5C — Move Focused Topics out of the capture→process flow
- [x] Moved below queue/stats (it's a "settings" concern, rarely changed)

---

## Phase 6 — UX: Digest Polish — DONE

- [x] **Differentiated empty states**: "All caught up!" (everything marked done) vs "No digest yet" (truly empty), checked against `allClusters` which includes done ones.
- [x] **Focused topic badge highlighting**: Matching topic badges use filled variant (`"default"`) instead of outline on tiles and in modal, so users see WHY a cluster ranks higher.
- [x] **Stale modal state after "Save to KB"**: `setSelectedCluster` updates status to `"promoted"` immediately on promote success, so button shows "Saved to KB" without waiting for refetch.

---

## Phase 7 — UX: Feedback & Loading — DONE

- [x] **Skeleton loading on Capture page**: Replaced "Loading queue..." text with 3 skeleton cards (title + domain + icon placeholders).
- [x] **Toast-based feedback system**: Replaced all inline success/error messages with sonner toasts (bottom-right, rich colors, close button, 5s auto-dismiss). Covers: single capture, batch capture, digest completion, learn now completion, promote to KB. Progress bars remain inline.

---

## Phase 8 — UX: Knowledge Page — NOT STARTED

- [ ] **Conversation history**: Maintain array of Q&A pairs in state. Render as a conversation thread instead of replacing previous answer. Related questions feed into next query naturally.

---

## Phase 9 — PDF/DOCX — NOT STARTED
- [ ] `scripts/ingest_doc.py` CLI: PyMuPDF / python-docx → chunk → embed → KB
- [ ] Web upload form alternative
- [ ] Document sources in RAG results

---

## Future Phases (not planned in detail)
- Phase 10: Improved Quote Extraction (pre-extract + LLM select + fallback — see PRD §10)
- Phase 11: Cloud deployment (Vercel + Render)
- Phase 12: Browser extension (Learn Now / Read Later buttons)

---

## UX Follow-up (after Phase 5, before backlog)
- **Tab/toggle mode selection on Capture page**: Replace two equal buttons with a tab that selects mode (Read Later / Learn Now). Context below input changes per mode. Always one primary action button. Bigger structural change but cleanest UX.
- **Compact queue summary**: Replace full queue item list with `Digest Queue: 5 articles ready · [Generate Digest]` and a "Show all" toggle. Dramatically shortens the page.
- **Post-capture next-step guidance**: After adding to queue, show count + direct link to generate digest instead of just "Added: [title]"
- **Input placeholder + microcopy**: Update placeholder to "Paste links (articles or YouTube, one per line)…". Add microcopy: "YouTube links are auto-transcribed."
- **Button subtitles**: Show destination under button labels (e.g., "Add to Digest Queue — appears in your next digest")

---

## UX Backlog (unprioritized, revisit later)
- Undo toast on "Done" action (defer actual API call ~5s, show undo option)
- Keyboard navigation in reading modal (`j`/`k` for prev/next, `d` for done, `l` for learn)
- Server-side topic filtering on Knowledge page (current client-side filter only applies to loaded page)
- Badge overload reduction on digest tiles (cap at 3-4 visible, rest in modal)
- MinimalTile redesign (currently near-identical to CompactTile — make it genuinely stripped down)
- Queue item removal (no way to delete accidentally added URLs)
- Accessible topic filter badges (`role="button"`, `tabIndex`, `aria-pressed`)
- **Focused Topics placement rethink**: Once topics are configured, the full CRUD UI is rarely needed but the user should still be reminded the feature exists and see what's active. Options: collapse by default showing "Focused Topics (4)" summary line that expands on click; move to a settings page with a subtle indicator on capture page; or a persistent pill strip (read-only) with an "Edit" link. Key tension: not always visible ≠ forgotten.
- Mobile swipe/touch patterns (swipe-to-dismiss, pull-to-refresh, bottom nav)

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

### Focused Topics — DONE
- [x] `user_settings` key-value table (JSONB) — stores focused topics as `key="focused_topics"`
- [x] `GET/PUT /api/settings/focused-topics` — CRUD API with dedup + max 20 validation
- [x] Prompt injection into `summarize()`, `tag_topics()`, `rag_answer()` — zero extra LLM cost
- [x] In-memory cache refreshed at pipeline start + RAG query time
- [x] Digest page: clusters matching focused topics float to top within each date group (client-side sort)
- [x] Frontend: FocusedTopics component on capture page with add/remove topic pills
- Not doing: no influence on clustering, no per-topic weighting, no Learn Now prompt changes

### Summarization Intelligence — DONE
- [x] Novelty bias: summarize prompt emphasizes surprising/non-obvious insights, skips common knowledge
- [x] Content style classification: LLM classifies each article as tutorial/demo/opinion/interview/news/analysis/narrative/review (via `summarize()` JSON output, zero extra LLM calls)
- [x] Information density scoring: LLM rates 1-10 how dense/actionable the content is (via `summarize()` JSON output)
- [x] Quote extraction improved: prompt biases toward controversial, provocative, uniquely insightful quotes with speaker attribution
- [x] YouTube demo detection: transcript-level heuristics detect screen demos, code walkthroughs, visual content (no LLM needed)
- [x] YouTube description analysis: extracts video description metadata, checks for tutorial keywords and timestamps
- [x] New DB columns: `articles.content_attributes` (JSONB), `clusters.content_style`, `clusters.information_density`, `clusters.content_attributes` (JSONB)
- [x] Digest tiles show content style badge, density indicator (fire icon for 7+), and "Screen demo" badge for videos
- [x] Digest sorting uses information_density as secondary sort key (after focused topic match)
- Shelved: KB-aware novelty (see PRD §10), separate scoring step (see PRD §10), improved quote extraction (see PRD §10)

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

### Knowledge Base — Smart Sorting
- Current: sorted by `created_at` desc (most recent first)
- **"Most queried" sorting**: Track which KB articles appear most frequently in RAG query results, sort by relevance/usage
- Could also weight by recency + query frequency for a blended sort
- Requires logging which `knowledge_item_id`s are returned per RAG query (could piggyback on `llm_usage` or a separate table)

---

## Verification

After each phase:
1. Manual test the happy path end-to-end
2. Test on both desktop and mobile viewport
3. Test with Ollama running (local model) and stopped (cloud fallback)
4. Verify Neon data is correct (use TablePlus)
