# Implementation Plan
## Distill - Phased Build Roadmap
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
| 5 | UX: Flow Clarity | DONE | Rename actions, make pipeline visible, onboarding |
| 6 | UX: Digest Polish | DONE | Empty states, focused topic badges, stale modal fix |
| 7 | UX: Feedback & Loading | DONE | Skeleton loading, toast-based feedback |
| 8 | UX: Knowledge Page | DONE | Conversation history, conversational RAG |
| 9 | PDF/DOCX | NOT STARTED | Document ingestion CLI + web upload |
| 10 | Unpack | DONE | On-demand drill-down, video timestamps, modal animation |
| 11 | Feed: Newsletters + Sources | MOSTLY DONE | Gmail newsletters + RSS/YouTube aggregator → unified feed |

---

## Phase 0 - Foundation - DONE

### Tasks
- [x] Init monorepo: `/backend` (FastAPI), `/frontend` (Next.js), `/docs`
- [x] `/backend`: `uv` project with all deps
- [x] `/frontend`: `pnpm` Next.js with tailwind, shadcn/ui, zustand, @tanstack/react-query, lucide-react
- [x] Env config: `.env.example`, single `.env` at repo root
- [x] Postgres database + connection strings
- [x] Alembic migration: all tables + pgvector + HNSW index
- [x] `backend/app/core/task_router.py`: `embed()`, `summarize()`, `score_quality()`, `tag_topics()`, `rag_answer()`
- [x] FastAPI `GET /health` endpoint (checks DB + Ollama)
- [x] Next.js scaffold calling `/health`
- [x] CORS configured, API proxy via `next.config.ts` rewrites
- [x] `truststore` for macOS SSL certificate handling

---

## Phase 1 - Consume Later Pipeline - MOSTLY DONE

### 1A - Capture - DONE
- [x] `POST /api/capture`: accepts `{ url, mode }`, dedup via SHA256, insert article
- [x] `POST /api/capture/batch`: multi-URL capture (up to 50)
- [x] `ArticleExtractor`: httpx fetch → readability-lxml → clean_text + og:image extraction
- [x] Paywall detection: clean_text < 200 words → `extraction_quality=low`
- [x] Frontend: textarea input (single or multi-line URLs), Learn Now / Read Later buttons, queue list

### 1B - Processing - MOSTLY DONE
- [x] `POST /api/digest/process`: background asyncio task (no timeout)
- [x] Pipeline: chunk_text → summarize → tag_topics → embed(headline) → cosine clustering → write clusters
- [x] Frontend: Process Now button with live progress polling
- [x] Race condition guard: in-memory asyncio lock
- [ ] APScheduler nightly sweep (deferred - low priority for single-user)

### 1C - Digest Dashboard - DONE
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
- [x] LLM provider indicator in navbar: Monitor (green) for local, Cloud (amber) for paid - pulses while active, fades when idle
- [x] RAG query shows which LLM answered (local vs cloud badge)

---

## Phase 2 - Learn Now + RAG - DONE

### 2A - Learn Now - DONE
- [x] `knowledge_service.py`: chunk → tag_topics → embed → KnowledgeItem + Embeddings
- [x] `POST /api/capture` with `mode=learn_now`: extract → index to KB immediately
- [x] Article status goes `queued → kb_indexed`
- [x] Frontend: Learn Now button triggers full pipeline at capture time

### 2B - "Learn This" Promotion - DONE
- [x] `POST /api/digest/{id}/promote`: fetch cluster articles → chunk → embed → KB
- [x] Cluster status set to `promoted`
- [x] Frontend: Learn This button in reading modal with loading/success/error states

### 2C - RAG Query - DONE
- [x] `POST /api/rag/query`: embed(question) → pgvector top-5 → rag_answer → citations
- [x] `GET /api/kb`: list all knowledge base items with chunk counts
- [x] Frontend: `/knowledge` page with question input, answer card, deduplicated source citations, related questions
- [x] Knowledge nav link enabled

---

## Phase 3 - Polish - IN PROGRESS
- [ ] Quality gate: score_quality < 7 → cloud re-route (deferred)
- [ ] Snooze 1 day on digest clusters (deferred)
- [x] Cost tracker: `llm_usage` table, in-memory buffer with 60s flush, `GET /api/stats` with totals/by-task/daily/recent aggregations, collapsible StatsCard on capture page
- [x] Paywall warning badge on digest tiles + modal sources (reuses `extraction_quality=low`)
- [x] Loading states: skeleton cards on Knowledge page, spinners on all buttons/mutations, progress bars on digest/learn-now processing

---

## Phase 4 - YouTube Support - DONE
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

## Phase 5 - UX: Flow Clarity & Onboarding - DONE

The core problem: "Read Later", "Learn Now", "Process Now", and "Learn This" are not self-explanatory. Users must already understand the pipeline to use the page correctly.

### 5A - Rename actions with outcome, not mechanism
Current labels use abstract metaphors. Renamed to describe the destination:
- [x] "Read Later" → **"Add to Digest Queue"** (says where it goes)
- [x] "Learn Now" → **"Save to Knowledge Base"** (says where it goes)
- [x] "Process Now" → **"Generate Digest"** (says what you get)
- [x] "Learn This" (in digest modal) → **"Save to Knowledge Base"** (consistent)
- [x] Updated placeholder: "Paste links (articles or YouTube, one per line)…"
- [x] Updated empty state text to reference new button labels

### 5B - Make the pipeline visible on Capture page
- [x] "Generate Digest" button surfaces directly below the queue list (prominent dashed-border CTA)
- [x] Post-capture feedback includes next step: `✓ Added "Title" · 3 in queue · [Generate Digest →]`
- [x] Queue CTA shows inline flow hint: `3 articles ready · Generate a digest to read summaries`
- [x] **Auto-redirect after processing**: Navigates to `/digest` on successful completion

### 5C - Move Focused Topics out of the capture→process flow
- [x] Moved below queue/stats (it's a "settings" concern, rarely changed)

---

## Phase 6 - UX: Digest Polish - DONE

- [x] **Differentiated empty states**: "All caught up!" (everything marked done) vs "No digest yet" (truly empty), checked against `allClusters` which includes done ones.
- [x] **Focused topic badge highlighting**: Matching topic badges use filled variant (`"default"`) instead of outline on tiles and in modal, so users see WHY a cluster ranks higher.
- [x] **Stale modal state after "Save to KB"**: `setSelectedCluster` updates status to `"promoted"` immediately on promote success, so button shows "Saved to KB" without waiting for refetch.

---

## Phase 7 - UX: Feedback & Loading - DONE

- [x] **Skeleton loading on Capture page**: Replaced "Loading queue..." text with 3 skeleton cards (title + domain + icon placeholders).
- [x] **Toast-based feedback system**: Replaced all inline success/error messages with sonner toasts (bottom-right, rich colors, close button, 5s auto-dismiss). Covers: single capture, batch capture, digest completion, learn now completion, promote to KB. Progress bars remain inline.

---

## Phase 8 - UX: Knowledge Page - DONE

- [x] **Conversation history UI**: Q&A pairs stored in `history` state array, rendered as a chat-style thread (user question right-aligned, answer cards below). Related questions shown only on the latest answer, clicking one adds to thread. Auto-scrolls to latest entry. Pending query shows inline with spinner.
- [x] **Conversational RAG context**: Client sends recent Q&A history with each query. Backend trims to ~4000 character budget (whole exchanges only, walking backward from most recent, minimum 1 exchange) and injects into `rag_answer()` prompt. This lets users ask follow-ups without server-side session state. History is ephemeral (session-scoped, not persisted).

---

## Phase 9 - PDF/DOCX - NOT STARTED
- [ ] `scripts/ingest_doc.py` CLI: PyMuPDF / python-docx → chunk → embed → KB
- [ ] Web upload form alternative
- [ ] Document sources in RAG results

---

## Future Phases (not planned in detail)
- Phase 10: Improved Quote Extraction (pre-extract + LLM select + fallback - see PRD §10)
- Phase 11: Cloud deployment (Vercel + Render)
- Phase 12: Browser extension (Learn Now / Read Later buttons)

---

## Completed UX Follow-ups
- ~~**Tab/toggle mode selection on Capture page**~~: DONE - inline toggle (Digest Queue / Knowledge Base) with contextual description per mode, single "Add" action button.
- ~~**Post-capture next-step guidance**~~: DONE (Phase 5B) - toast + "Generate Digest →" link after capture.
- ~~**Input placeholder + microcopy**~~: DONE (Phase 5A) - updated placeholder text.
- ~~**Button subtitles**~~: DROPPED - redundant after mode toggle contextual description was added.

---

## UX Follow-up (next up)
- ~~**Compact queue summary**~~: DONE - Collapsible queue with summary line (article count, video/paywall counts) and chevron toggle. Items hidden by default.
- ~~**Digest modal prev/next navigation**~~: DONE - Prev/Next chevron buttons with position counter (e.g. "3/12") in modal header. Navigates through visible (filtered) clusters.

---

## Phase 10 - Unpack (On-Demand Drill-Down) - DONE

### 10A - Unpack Phase 1 - DONE
- [x] `clusters.unpacked_sections` JSONB column + Alembic migration
- [x] `unpack_sections()` in task_router (heavy tier, 12k char budget, JSON response)
- [x] `POST /api/digests/{cluster_id}/unpack` - server-side cache, paywall gate, focused topics injection
- [x] `unpacked_sections` exposed in `ClusterItem` API response
- [x] Frontend: "Unpack" button in reading modal summary tab → 3-5 structured sections
- [x] Client-side cache: instant re-open after first unpack, reset on prev/next navigation

### 10B - Unpack Phase 2 - DONE
- [x] Preserve per-segment timestamps from YouTube transcript API in `content_attributes.timestamped_segments`
- [x] `_build_timestamped_text()` helper formats transcript with `[MM:SS]` markers every 30s for LLM context
- [x] `unpack_sections()` accepts `is_video` flag - prompt instructs LLM to extract nearest timestamp per section
- [x] `UnpackSection` model gains optional `timestamp` field (backend + frontend)
- [x] Frontend renders clickable `▶ MM:SS` links that open YouTube at the correct moment
- [x] Graceful fallback: old videos without stored timestamps show sections without links

### 10C - Unpack Phase 3 - DONE
- [x] Dialog open/close animation: fade + zoom + slide-up (duration 200ms, was 100ms and imperceptible)
- [x] Summary ↔ unpacked view crossfade transition (`animate-in fade-in`)
- [x] Staggered section reveal: unpack sections cascade in with 75ms delay per section

---

## Phase 11 - Feed: Newsletters + Sources - NOT STARTED

Unified feed combining Gmail newsletters and RSS/YouTube source aggregation. Shared `feed_sources` + `feed_items` tables, single Feed page with topic-matched ranking.

**Storybook mockups:** `frontend/src/stories/mockups/FeedMockups.stories.tsx` - 6 interactive screens covering Settings, Feed empty/scan/populated states, newsletter strategy reference, and left sidebar navigation with date grouping.

**Design decisions:**
- Separate `/feed` page (not mixed into digest - these items weren't manually curated)
- On-demand fetch only (no cron until dedicated hosting)
- Multi-item newsletters split into individual entries
- RSS/YouTube items capped at 25 most recent per source per scan
- RSS items are NOT summarized upfront - only `tag_topics()` for matching. Full summarization happens when user captures an item into digest queue or KB.
- Newsletter items ARE summarized upfront (full text is available from the email body)
- Topic matching: ranked sections - matching items on top, non-matching in "Other" section
- **Source config lives in Settings page** (set-and-forget, not daily). Feed page shows subtle "N sources · Edit" link in header. Empty feed nudges user to Settings with deep link.
- **Settings page** consolidates: Feed Sources, Focused Topics (from Capture), Gmail config, LLM Stats (from Capture). Gear icon in navbar.
- **Newsletter strategy: RSS-first.** Many newsletters (Substack, Ghost, Beehiiv) have RSS feeds - add as RSS sources. Gmail IMAP only for email-only newsletters.

### 11A - Shared Infrastructure: Data Model & Feed API - DONE
- [x] Alembic migration: `feed_sources` + `feed_items` tables (see architecture.md §5.6-5.7)
- [x] `feed_sources` CRUD: `GET/POST/DELETE /api/feed/sources`
- [x] `app/services/feed_service.py`: orchestrates fetch across all source types, background asyncio task
- [x] `POST /api/feed/fetch` - trigger fetch for all active sources. Background asyncio task.
- [x] `GET /api/feed/fetch-status` - processing progress
- [x] `GET /api/feed?status=&source_type=&before_date=` - paginated feed items, ordered by topic_match_score desc then published_at desc
- [x] `PATCH /api/feed/{id}` - update status (read, archived)
- [x] `POST /api/feed/{id}/capture` - capture to digest queue or KB (triggers existing article extraction + processing pipelines)
- [x] Topic matching: `tag_topics()` on each item, compute `topic_match_score` = count of `topic_tags ∩ focused_topics`

### 11B - YouTube Channel Sources (first source type) - DONE
- [x] YouTube channel URL → extract channel_id → convert to RSS feed URL (`youtube.com/feeds/videos.xml?channel_id=X`)
- [x] `app/services/source_detector.py`: auto-detects YouTube channels (/@handle, /channel/UCxxx, /c/name, /user/name), resolves to RSS URL via HTML scraping
- [x] `POST /api/feed/sources/detect` - auto-detection endpoint (also handles RSS/blog sources for 11D)
- [x] `app/services/rss_fetcher.py`: `feedparser` fetch per source, cap 25 most recent entries
- [x] Dedup via RSS guid stored in `feed_items` (unique index on `feed_source_id + guid`)
- [x] Store in `feed_items` with `source_type='youtube'`, no summary (title + description from RSS)
- [x] YouTube thumbnails via predictable URL pattern (reuse existing logic from video_extractor)
- [x] Update `feed_sources.last_fetched` timestamp

### 11C - Frontend: Feed Page - DONE
Storybook mockups: `src/stories/mockups/FeedMockups.stories.tsx` (screens 2-4)

- [x] `/feed` route with nav link (Rss icon)
- [x] "Fetch Feed" button in header (triggers fetch for all sources)
- [x] **Empty state** (no sources configured): centered Rss icon, explanation text, "Set up Feed Sources" button → links to `/settings#feed-sources`. Tip nudge for focused topics.
- [x] **Header** (sources configured): "N sources configured · [Edit] · Last fetched Xh ago" - Edit links to Settings
- [x] **Scan progress**: card with per-source progress bar (source name, N/total count). Completion summary toast: new items / topic matches / sources scanned
- [x] **Source type filter pills** (mobile): All / YouTube / RSS / Newsletter - toggle buttons with colored icons (red/orange/blue)
- [x] **Left sidebar** (desktop): All Sources / By Type / Individual Sources with unread counts - replaces filter pills on wide screens
- [x] **Chronological grouping**: Today / Yesterday / This Week / Older with sticky headers. Within each group: topic-matched items sorted first, with left border accent and filled topic badges
- [x] **Feed item cards**:
  - Row 1: source icon + name + type badge (colored pill) + published time (right-aligned)
  - Title (font-medium), topic tag badges (matching = filled, other = outline)
  - Description snippet (text-muted-foreground)
  - Actions row: Done / Add to Digest / Save to KB (ghost buttons) + Open Original (external link icon, right-aligned)
- [x] "All caught up" empty state when all items dismissed
- [ ] Infinite scroll / cursor pagination (deferred - initial load of 50 items sufficient for now)

### 11D - RSS Blog/Site Sources - DONE
- [x] Source auto-discovery for non-YouTube URLs:
  - Blog/site URL → fetch HTML, look for `<link rel="alternate" type="application/rss+xml">`
  - Direct RSS/Atom URL → validate with feedparser, use as-is
- [x] Reuses same `rss_fetcher.py` + `feed_service.py` pipeline from 11B
- [x] Store in `feed_items` with `source_type='rss'`

### 11E - Frontend: Settings Page - DONE
Storybook mockup: `src/stories/mockups/FeedMockups.stories.tsx` (screen 1)

- [x] `/settings` route with gear icon in navbar (not a primary nav item - sits after Ask)
- [x] Sectioned layout with `<Separator />` between sections:
  - **Feed Sources** (`id="feed-sources"`): add source input with Detect button + auto-detection result card, source list with type icon/badge/stats/delete button. Empty dashed-border state.
  - **Focused Topics** (`id="focused-topics"`): add/remove topic pills with X buttons, count + max 20 indicator. Migrated from Capture page.
  - **LLM Usage** (`id="stats"`): cost tracking, token usage, provider stats. Migrated from Capture page (StatsCard component).
- [x] Deep-linkable section anchors - Feed empty state links to `/settings#feed-sources`
- [ ] **Gmail Newsletters** (`id="gmail"`, `Optional` badge): deferred to Phase 11F

### 11F - Newsletter Sources (Gmail IMAP)
- [ ] `app/services/email_fetcher.py`: IMAP connection via `imap_tools`, fetch unread since last fetch
- [ ] Gmail credentials from `.env` (`GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`)
- [ ] `app/services/newsletter_parser.py`: HTML email → split into individual items
  - HTML structure analysis (h2/h3 headings, hr separators, repeated div patterns)
  - Text heuristics (numbered lists, `---` separators, bold title + description patterns)
  - Extract per-item: title, content text, linked URL (if present)
  - Single-topic newsletters kept as one item
- [ ] Each split item → `summarize()` + `tag_topics()` via task_router (newsletters get full summarization since full text is available)
- [ ] Dedup via Message-ID stored as `guid` in `feed_items`
- [ ] Mark Gmail messages as SEEN after processing
- [ ] Gmail newsletter source auto-created from `.env` config

### 11F-2 - Feed UX: Left Nav + Chronological Grouping - DONE
- [x] **Feed page left sidebar** (desktop): All Sources, By Type (YouTube/RSS/Newsletter), individual sources - each with unread counts. Toggle-to-deselect, "Manage Sources" link. Mobile: filter pills fallback.
- [x] **Feed date groups**: Items grouped by Today / Yesterday / This Week / Older. Sticky headers with separator line and item count. Within each group: topic-matched items float to top (sorted by match score then recency), visually distinguished with left border accent.
- [x] **Digest page left sidebar** (desktop): All Topics, Focused topics (star icon), Other topics (hash icon) - each with cluster counts. Mobile: topic filter pills fallback.
- [x] **Digest sticky date headers**: Upgraded from plain text to sticky headers with separator line and cluster count.
- [x] **Digest tile layout**: Title + subtitle above tags (was tags above title). Image floated right in CardContent so summary text wraps around it instead of side-by-side flex layout.
- [x] Client-side filtering for feed (all unread items fetched in one query, filtered locally for accurate sidebar counts).

### 11G2 - Feed: Future-Date Filtering & Retention Purge - DONE
- [x] Skip future-dated RSS entries (scheduled/upcoming YouTube premieres, etc.) during fetch
- [x] Configurable retention limit per source (`FEED_RETENTION_PER_SOURCE`, default 100)
- [x] Auto-purge oldest non-captured items after each source fetch
- [x] Captured items (linked to digest/KB) are never purged

### 11G - Feed: On-Demand Summarize - NOT STARTED
On-demand per-item summarization for feed items that lack descriptions (common for YouTube RSS, sparse blog feeds).

**Problem:** Many feed items only have a title - no description or content snippet. User can't triage effectively without understanding what the article is about.

**Design:**
- New endpoint: `POST /api/feed/{item_id}/summarize`
- Backend flow: fetch URL → extract clean text (reuse existing `content_extractor`) → run `summarize()` (same prompt as digest pipeline) → cache result in `feed_item.summary` + `feed_item.bullets`
- Frontend: "Summarize" button on feed cards → expands card inline with summary + bullets
- Cache: once summarized, subsequent views load from DB instantly
- No auto-summarization at fetch time - only on-demand (most items get dismissed)
- Reuses existing extraction + summarization infrastructure (no new LLM prompts)

**Tasks:**
- [ ] `POST /api/feed/{item_id}/summarize` endpoint - fetch URL, extract, summarize, cache to feed_item
- [ ] Frontend: "Summarize" button on FeedItemCard, inline expansion with loading skeleton
- [ ] Handle edge cases: already summarized (return cached), no URL, extraction failure

### 11H - Debounced Auto-Process on Capture - DONE
Auto-trigger digest processing after feed items are captured, with a configurable debounce delay.

**Problem:** Current flow requires manual "Process" trigger after capturing feed items. User captures items from Feed, switches to Digest, and sees nothing - has to go back and trigger processing.

**Design:**
- After any feed-to-digest capture, schedule digest processing to fire after a configurable delay (default: 30 seconds)
- If more captures come in during the delay window, the timer resets (debounce)
- When the timer fires, calls existing `start_processing_in_background()` with its asyncio lock
- Delay is configurable via `DIGEST_AUTO_PROCESS_DELAY_SECONDS` env var (0 = disabled)
- Existing manual "Process" button still works (unchanged)

**Tasks:**
- [x] `schedule_deferred_processing()` function in `digest_processor.py` - cancelable asyncio timer that resets on each call
- [x] Call from feed capture endpoint (`POST /api/feed/{item_id}/capture`) on `consume_later` captures
- [x] Call from article capture endpoint (`POST /api/articles`) for `consume_later` captures (both new and recapture paths)
- [x] Configurable delay via env var `DIGEST_AUTO_PROCESS_DELAY_SECONDS` (default 30, 0 = disabled)
- [x] Frontend: no changes needed - Digest page already polls `/api/digests/processing-status` and shows progress when processing is active

### 11I - UX Follow-up (TODO: re-evaluate later)
- [ ] Evaluate merging Feed + Digest into a unified Feedly-like view
- [ ] Evaluate scheduled background fetch (cron) when dedicated hosting is available
- [ ] Source-level mute/prioritize controls
- [ ] Per-source topic filter (only scan for specific topics from specific sources)
- [ ] Reddit RSS support (reddit.com/r/{sub}/.rss)

---

## Bug Fixes (March 2026)
- [x] **Article recapture**: Finished articles (done/ready/kb_indexed/promoted/processing/failed) can be recaptured - re-extracts content and resets status instead of returning "duplicate"
- [x] **Unhashable type in digest processor**: `timestamped_segments` (list of dicts) caused `set()` crash during content_attributes merge - fixed to skip merging complex lists
- [x] **RAG source numbering mismatch**: LLM cited chunk-level `[Source N]` but frontend deduplicated by article - fixed by grouping chunks by source before sending to LLM
- [x] **Irrelevant RAG sources**: Added minimum similarity threshold (0.3) to pgvector query - low-relevance chunks no longer returned

---

## Other Backlog (prioritized)
- Server-side topic filtering on Knowledge page (current client-side filter only applies to loaded page)
- ~~Queue item removal~~: DONE -`DELETE /api/articles/{id}` endpoint + trash icon on each queue row.
- **KB sort/filter options**: Sort by information density, filter by source type (article/video) and extraction quality. Currently date-only.
- **KB retrieval usage tracking**: Log which `knowledge_item_id`s surface in RAG queries. Show "never cited" indicator or "last cited" date. Would allow smart sorting by relevance/usage. (See also "Knowledge Base - Smart Sorting" in Ideas.)

---

## Future Phases (major effort, planning needed)
- PDF/DOCX ingestion (Phase 9)
- Improved Quote Extraction (Phase 10)
- ~~**Focused Topics placement rethink**~~: DECIDED - Moving to Settings page as part of Phase 11E. Feed page header shows source count + Edit link. Digest page can show read-only topic pills with Edit link to Settings.
- Browser extension
- Mobile swipe/touch patterns (swipe-to-dismiss, pull-to-refresh, bottom nav)
- Cloud deployment
- **Unified Feed + Digest view**: Evaluate merging Feed and Digest into one view (re-evaluate after Phase 11)

---

## On Hold / Re-evaluate Later
- Accessible topic filter badges (`role="button"`, `tabIndex`, `aria-pressed`)
- Badge overload reduction on digest tiles (cap at 4-5 visible, rest in modal)
- Undo toast on "Done" action (defer actual API call ~5s, show undo option)
- Keyboard navigation in reading modal (`j`/`k` for prev/next, `d` for done, `l` for learn)
- MinimalTile redesign (currently near-identical to CompactTile - make it genuinely stripped down)
- **KB bulk select + delete**: Checkboxes on KB items with "Remove selected" for cleanup sessions.

---

## Ideas (unhashed - needs design)

### UX Coherence - Flow-Driven IA Redesign (Option A)

**Status:** DESIGN PHASE - iterating in Storybook (`src/stories/mockups/`)
**Decision:** Option A (intent-based pages) chosen over adaptive single-page (B) and incremental (C).
**Inspiration:** 37signals (Basecamp, HEY) - each screen answers one question; the cycle is the navigation; opinionated defaults over equal choices.

#### Why we're doing this
Right now the pages are organized by system concept (Capture, Digest, Knowledge), not by what you actually want to do. The Capture page alone is a URL input, queue manager, pipeline trigger, topic config, and stats dashboard, five jobs on one screen. Nothing pulls you forward through the natural cycle. Two capture modes present a system distinction as a user choice.

#### The design: intent-based pages

| Route | Nav label | One job | Current equivalent |
|---|---|---|---|
| `/` | **Save** | Paste a link and go. Nothing else. | Capture page (gutted) |
| `/read` | **Read** | Catch up on your unread digest. | Digest page (renamed) |
| `/ask` | **Ask** | Query your knowledge base. Chat only. | Knowledge page (top half) |
| `/library` | *(secondary)* | Browse/manage indexed KB articles. | Knowledge page (bottom half) |
| `/settings` | *(gear icon)* | Focused Topics, Stats, Reading prefs. | Scattered across Capture |

**Cycle nudges** - each page has a contextual nudge pointing to the next natural action:
- Save → "5 articles waiting → **Catch up now**"
- Read → "All caught up → **Ask something**"
- Ask → "Found something new? → **Save a link**"

#### Critical analysis - what's not yet figured out

**1. Where does "Generate Digest" live?**
This is the hardest open question. Currently the user manually triggers digest generation from the Capture page. In the new IA, Save is just "paste and go" - there's no room for a pipeline trigger. Options:
- **Auto-generate**: Run the digest pipeline automatically on a schedule or when article count crosses a threshold. Most 37signals-like (the system does the work, you just show up). But: local LLM processing is slow and resource-heavy - you don't want it firing while the user is doing other things on the same machine. Also removes user agency over *when* to process.
- **Trigger on the Read page**: When you navigate to Read and there are unprocessed articles, show a "Generate digest from N articles" prompt at the top before the clusters. Makes sense conceptually (you went to Read, so you want to read). But: processing takes 30-120s - the user came to read and now has to wait. That's a broken promise.
- **Trigger on Save after accumulation**: After saving, the nudge could say "5 articles queued -**Generate digest now**" instead of just "Catch up now." Keeps it on the Save page but only when relevant. Risk: re-cluttering Save with processing state.
- **Background auto-process + Read page just shows results**: Process in background whenever new articles accumulate (e.g., 5+ unprocessed). Read page always shows latest results. Most seamless, but needs a background job scheduler (cron or persistent worker) - new infrastructure.

**2. What happens to the queue visibility?**
Right now you can see, expand, and manage queued articles. In the stripped-down Save page, there's only a count ("5 articles waiting"). Is that enough? What if you accidentally saved the wrong URL? Options:
- Queue management moves to a sub-view of Save (expandable, like current collapsible design)
- Queue management moves to Settings/Library (clean, but disconnected from the save action)
- Minimal inline: just show count + "undo last save" toast for the most common correction

**3. Library as a 4th page - is it worth it?**
Splitting Knowledge into Ask + Library makes each page single-purpose, but it adds a 4th navigation item. 37signals would push back: more pages = more cognitive load. Counter-arguments:
- Library is a maintenance/config task, not a daily flow - it could live under Settings or as a sub-view of Ask (collapsible "Indexed articles" drawer)
- If Library is rarely visited, a dedicated nav slot wastes prime real estate
- But: KB article deletion and quality review *is* important for RAG quality - burying it hurts discoverability

**4. The "save directly to KB" escape hatch**
The mockup has a small "or save directly to Knowledge Base" link below the main Save input. Open questions:
- Is a text link enough discoverability? Power users will find it, but it's invisible to everyone else.
- Should it be a toggle (like current mode selector) but visually subordinated? e.g., small toggle below the input rather than a prominent equal-weight choice.
- Or should we drop it entirely and force all content through the digest pipeline? The digest "promote to KB" flow already exists. The direct-to-KB path was added as a shortcut, not a core flow. Removing it simplifies the mental model: everything you save goes to digest, and the best stuff gets promoted to permanent KB. Trade-off: no way to immediately index something you want to query right now.

**5. Nav badge count - what number?**
The Read nav item shows a badge count. What does it count?
- Unread clusters (current `status !== "done"`)? Could be stale - 50 unread from last week feels like a chore, not a nudge.
- Clusters from today only? More HEY-like ("3 new today"), but ignores legitimate backlog.
- Unprocessed articles (queued but not yet digested)? Different meaning - "you have raw material" vs "you have summaries to read."
- Perhaps: **new since last visit** - most meaningful, but requires tracking last-read timestamp (new state to manage).

**6. Processing status feedback**
Right now there are inline progress bars on the Capture page during digest generation and Learn Now indexing. In the new IA:
- If processing is triggered from Save, the progress bar is on Save. But the user might navigate to Read while waiting.
- If triggered from Read, the progress bar is on Read. Makes more sense but means Read has two states: "generating..." and "here are your clusters."
- Global indicator? The navbar LLM status light already shows activity. Could add a small "Processing 3/5..." label next to it that's visible on any page.

**7. Focused Topics placement**
Currently on the Capture page. Moving to Settings is clean, but Focused Topics meaningfully shapes what you see on Read (sort order) and Ask (RAG answers). If it's buried in Settings, will users forget it exists?
- Option: Read-only topic pills on the Read page header (showing what's active), with an "Edit" link to Settings
- Option: First-run prompt on Read page when no topics are configured: "Set your interests to personalize your digest → [Configure]"

**8. Does the cycle actually hold up?**
The Save → Read → Ask → Save loop sounds clean, but real usage might not be so tidy:
- Some sessions are *just* saving (found 10 links, dump them all, leave)
- Some sessions are *just* reading (morning digest routine, no saving)
- Some sessions are *just* asking (need to recall something specific)
- The cycle nudges assume you'll flow through all three. If you only use one page per session, the nudges are noise. Should they be dismissable? Contextual (only show after certain actions)? Or just subtle enough that ignoring them costs nothing?

**9. Migration effort - what breaks?**
Changing from 3 pages to 4-5 means:
- URL routes change (`/digest` → `/read`, `/knowledge` → `/ask` + `/library`)
- Bookmarklet uses `/?url=` - that stays the same (Save is still `/`)
- Navbar restructure (3 primary + 1 secondary + settings gear)
- Existing Capture page components need to be decomposed and redistributed
- Processing status system needs rethinking (currently tightly coupled to Capture page state)
- Queue management extracted into its own component
- API proxy routes in `next.config.ts` unaffected (backend unchanged)

#### Design principles (kept from earlier analysis)

1. **Each screen = one job.** If a page answers more than one question, split it or subordinate.
2. **The cycle is the navigation.** Nudges point to the next natural action, not just pages.
3. **Opinionated defaults over equal choices.** Digest path is the default; direct-to-KB is the escape hatch.
4. **Calm software.** Show counts only where they drive a decision.
5. **Progressive disclosure.** Config tasks (topics, stats, KB management) live outside the primary flow.

---

### Customizable Summarization + Progressive Expansion
- **System-level default depth**: User-configurable summary verbosity (concise / standard / detailed) - affects digest processing output
- Configurable bullet point count (currently hardcoded to 3)
- Settings stored client-side (Zustand) and sent as params to summarize pipeline
- **On-demand expansion** ("Expand Summary" in reading modal): progressive disclosure for individual clusters
  - User reads concise summary → clicks Expand → LLM generates detailed summary with sections of interest
  - Inspired by Chrome/Edge built-in summarization UX
  - Cache expanded summaries in JSONB on `clusters` table (e.g., `summaries: { concise, detailed }`) - avoid re-generating on re-open
  - **Cost control**: local LLM only by default; no cloud fallback unless explicitly configured
  - **Short content guard**: disable expansion when source article is too short to produce a meaningfully deeper summary (tentatively ~500 words min; also auto-disable for `extraction_quality=low` articles)
  - Open question: how many expansion levels? Two (concise → detailed) is probably enough

### Focused Topics - DONE
- [x] `user_settings` key-value table (JSONB) - stores focused topics as `key="focused_topics"`
- [x] `GET/PUT /api/settings/focused-topics` - CRUD API with dedup + max 20 validation
- [x] Prompt injection into `summarize()`, `tag_topics()`, `rag_answer()` - zero extra LLM cost
- [x] In-memory cache refreshed at pipeline start + RAG query time
- [x] Digest page: clusters matching focused topics float to top within each date group (client-side sort)
- [x] Frontend: FocusedTopics component on capture page with add/remove topic pills
- Not doing: no influence on clustering, no per-topic weighting, no Learn Now prompt changes

### Summarization Intelligence - DONE
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
- **Truthfulness score**: Deferred - requires retrieval-based verification to be reliable, not just LLM self-grading
- Should run on local LLM only by default (cost: ~$0.005/article on cloud)
- Scores displayed on digest tiles as subtle indicators

### Agentic AI & Workflow Patterns
- Audit codebase for opportunities to apply AI workflow patterns (chain-of-thought, reflection, tool use, planning, evaluation loops)
- Refactor existing AI pipelines (summarization, RAG, topic tagging) to apply relevant patterns
- Examples: multi-step summarization with self-critique, agentic RAG with query decomposition, quality scoring with reflection

### Chat with External LLM ("Discuss This")
- Button inside digest reading modal to continue exploring a topic via an external chat platform
- Context to send: digest summary + bullet points + source URLs (not full article text - too long)
- **Platform deep-link support (as of early 2025):**
  - **ChatGPT**: No official URL scheme to pre-fill a new chat with context
  - **Claude**: No deep-link API for initiating a chat with payload
  - **Perplexity**: No known pre-fill URL, but search queries work via `perplexity.ai/search?q=`
- **Practical approaches to evaluate:**
  1. **Copy-to-clipboard**: Format context as markdown, user pastes into their preferred chat. Lowest friction, works everywhere.
  2. **In-app chat**: Use OpenAI/Anthropic API directly within Distill to continue the conversation (adds cost, but keeps context in-app).
  3. **Perplexity search link**: Open `perplexity.ai/search?q={encoded question about topic}` - loses full context but good for research follow-up.
- Open question: which approach best fits the workflow? Could offer multiple ("Copy context" + "Ask in Distill" + "Search Perplexity").

### Knowledge Base - Smart Sorting
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
4. Verify DB data is correct (use TablePlus)
