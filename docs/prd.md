# Product Requirements Document
## Distill — Personal AI Knowledge & Digest System
**Version:** 0.3
**Last Updated:** March 2026
**Status:** Draft

---

## 1. Overview

Distill is a personal AI-powered knowledge management system that helps a single user capture, digest, and retrieve information from articles, YouTube videos, and documents. It solves the "read later graveyard" problem by transforming saved content into structured, scannable digests — and lets the user selectively promote high-value content into a searchable personal knowledge base (RAG).

The system is designed **local-first**: all heavy AI processing (summarization, embedding, RAG) runs on the user's own hardware (PC with RTX 5060 Ti or MacBook M3 Pro) using Ollama. Cloud LLMs (gpt-4o-mini, claude-haiku) serve only as automatic fallback when local models are unavailable.

Two capture modes:
- **Consume Later**: Queue articles for batch digest processing (nightly or on-demand)
- **Learn Now**: Immediately extract, chunk, embed, and index content into the knowledge base

---

## 2. Problem Statement

| Problem | Pain Today |
|---|---|
| Too many articles saved, never read | Pocket/Instapaper graveyard |
| Same news story covered 5 times | Redundant reading, wasted time |
| Can't search across things I've read | Knowledge is siloed in browser history |
| RAG tools require expensive cloud APIs | Cost barrier to personal AI tools |
| No way to cross-reference personal learning | "I read about this somewhere..." |

---

## 3. Goals

### Must Have (MVP)
- User can paste an article URL and choose "Learn Now" (immediate to KB) or "Consume Later" (digest queue)
- On-demand processing: user can trigger digest processing at any time via "Process Now"
- Nightly batch job also processes queued consume_later items automatically
- Dashboard shows today's digest as story clusters with progressive drill-down
- User can promote any digest item to the knowledge base ("Learn this")
- User can query the knowledge base via natural language (RAG)
- All AI tasks route through a single task router with local-first, cloud-fallback logic
- Responsive UI works on desktop and mobile from day one

### Should Have (Post-MVP)
- YouTube URL support (transcription + digest/KB integration)
- Quality gate: re-route low-scoring local summaries to cloud model
- Snooze digest clusters for 1 day
- Cost tracking for LLM usage

### Nice to Have (Future)
- PDF/DOCX document ingestion (CLI script or web upload)
- Browser extension for one-click capture
- Cloud deployment (Vercel + Render)

### Won't Have (MVP)
- Multi-user support
- Mobile app
- Social/sharing features

---

## 4. Non-Goals

- This is NOT a general-purpose web search tool
- This does NOT replace Notion or Obsidian (no manual note-taking)
- This does NOT store content the user has not explicitly saved
- This does NOT process paywalled content the DOM cannot access
- Chunking is NOT an AI task — it is a deterministic algorithm with zero LLM cost

---

## 5. User Stories

### Capture Flow
- As a user, I want to paste an article URL and click "Learn Now" so it is immediately extracted, chunked, embedded, and added to my knowledge base
- As a user, I want to paste an article URL and click "Read Later" so it is queued for the next digest
- As a user, I want to see my current queue of unprocessed items

### On-Demand Processing
- As a user, I want to click "Process Now" to trigger digest processing immediately instead of waiting for the nightly batch

### Digest Flow (Consume Later)
- As a user, I want to see today's articles grouped by topic so I can scan efficiently
- As a user, I want related articles covering the same story merged into one cluster
- As a user, I want to click a cluster to see concise bullet summaries without reading in full
- As a user, I want to expand to key highlights or quotes if a story interests me deeply
- As a user, I want to mark items as done so my dashboard stays clean
- As a user, I want to promote a digest item to my knowledge base with one click ("Learn this")

### Learn Now Flow
- As a user, I want inline progress feedback when "Learn Now" is processing my URL
- As a user, I want the article to appear in my KB immediately after Learn Now completes

### Knowledge Base Flow (RAG)
- As a user, I want to ask "What are the best practices for Kubernetes networking?" and get an answer sourced only from my saved content
- As a user, I want to see which articles the answer came from with highlighted excerpts
- As a user, I want suggested follow-up questions after each RAG answer

---

## 6. Functional Requirements

### 6.1 Link Submission (MVP)
- FR-01: User can paste one or more article URLs into a submission form
- FR-02: User selects capture mode: "Learn Now" or "Read Later"
- FR-03: Backend fetches HTML, extracts clean text via readability-lxml at capture time
- FR-04: Content stored in `articles` table with `mode=consume_later|learn_now`
- FR-05: Duplicate URLs detected by SHA256 hash and skipped
- FR-06: Paywall detection: clean_text < 200 words flags `extraction_quality=low`

### 6.2 Learn Now Pipeline (MVP)
- FR-07: Learn Now articles are immediately extracted, chunked, embedded, and indexed into the KB
- FR-08: Article status transitions: `queued → kb_indexed`
- FR-09: Frontend shows inline progress during Learn Now processing

### 6.3 Consume Later Processing (MVP)
- FR-10: `POST /api/digest/process` triggers on-demand processing of queued consume_later items
- FR-11: APScheduler nightly sweep processes any remaining unhandled items
- FR-12: Pipeline: chunk_text → summarize → tag_topics → embed(headline) → cosine clustering → write clusters
- FR-13: Race condition guard prevents duplicate processing
- FR-14: Frontend shows "Process Now" button with processing status

### 6.4 Digest Dashboard (MVP)
- FR-15: Dashboard shows all clusters for today's digest date
- FR-16: Topic filter pills allow filtering by auto-assigned topic
- FR-17: Level 0: cluster title, source count, 1-line headline
- FR-18: Level 1 (click): side drawer with bullet summary, source list with open-original links
- FR-19: Level 2 (tabs): Highlights, Quotes, Sources
- FR-20: "Learn this" promotes cluster content to knowledge base (triggers embed pipeline)
- FR-21: "Done" archives the cluster from active digest view
- FR-22: Digest history accessible via date picker

### 6.5 Knowledge Base / RAG (MVP)
- FR-23: User types a natural language question
- FR-24: Question embedded using same model as documents (enforced by single `embed()` function)
- FR-25: Top-k=5 chunks retrieved from pgvector by cosine similarity
- FR-26: Context + question sent to `rag_answer()` via task router
- FR-27: Answer displayed with inline citation numbers [1][2][3]
- FR-28: Source cards shown below with title, domain, highlighted excerpt
- FR-29: Related questions suggested below sources

### 6.6 YouTube Support (Post-MVP)
- FR-30: YouTube URLs detected by domain; transcript fetched via youtube-transcript-api (free)
- FR-31: Videos work in both Learn Now and Consume Later modes
- FR-32: Videos can cluster with articles on the same topic

### 6.7 Feed: Newsletters + Source Aggregation (Post-MVP)
- FR-33: Dedicated Gmail account connected via IMAP + App Password for newsletter subscriptions
- FR-34: On-demand "Fetch Feed" triggers both IMAP pull and RSS source scan
- FR-35: Multi-item newsletters (e.g., TLDR) are split into individual feed entries
- FR-36: Newsletter items summarized via existing `summarize()` pipeline; RSS items show title + description only (summarized on capture)
- FR-37: User configures RSS/YouTube sources; system auto-discovers feed URLs from site/channel URLs
- FR-38: RSS/YouTube scan capped at 25 most recent items per source per scan
- FR-39: Each RSS item topic-tagged via `tag_topics()` and scored against focused topics
- FR-40: Feed page displays ranked sections: topic-matching items first, non-matching in "Other"
- FR-41: Feed items can be captured to digest queue or KB, marked read/archived
- FR-42: Gmail credentials stored in `.env` (GMAIL_ADDRESS, GMAIL_APP_PASSWORD)

### 6.8 Document Ingestion (Future)
- FR-43: CLI script `scripts/ingest_doc.py` for PDF/DOCX → chunk → embed → KB
- FR-44: Web upload form alternative

### 6.8 Document Ingestion (Future)
- FR-43: CLI script `scripts/ingest_doc.py` for PDF/DOCX → chunk → embed → KB
- FR-44: Web upload form alternative

---

## 7. Non-Functional Requirements

| Requirement | Target |
|---|---|
| On-demand batch (20 items, local PC) | < 3 minutes |
| On-demand batch (20 items, cloud fallback) | < 6 minutes |
| Learn Now single article (local) | < 30 seconds |
| RAG query response (local) | < 10 seconds |
| RAG query response (cloud fallback) | < 5 seconds |
| Cloud LLM cost | < $1/month under normal use |
| Embedding model consistency | Query and document embeddings MUST use identical model |
| Responsive UI | Usable on mobile viewport (375px+) |

---

## 8. Content Type Support Matrix

| Content Type | Phase | Capture Method | Extract Method | RAG-able? |
|---|---|---|---|---|
| Article (public) | MVP | Paste URL | readability-lxml | Via Learn Now or Learn This |
| Paywalled article | MVP | Paste URL | Partial (teaser only) | Low quality warning |
| YouTube video | Post-MVP | Paste URL | youtube-transcript-api | Via Learn Now or Learn This |
| Email newsletter | Post-MVP | IMAP fetch (Gmail) | HTML parse + split | Via Feed → Capture to KB |
| RSS article | Post-MVP | RSS/Atom feed | feedparser (title+desc only) | Via Feed → Capture to Digest/KB |
| YouTube (subscribed) | Post-MVP | YouTube channel RSS | feedparser (title+desc only) | Via Feed → Capture to Digest/KB |
| PDF document | Future | CLI script / upload | PyMuPDF | Direct to KB |
| DOCX document | Future | CLI script / upload | python-docx | Direct to KB |

---

## 9. Success Metrics (Personal Use)
- Daily active use: opening the digest 5 out of 7 days/week
- "Learn this" conversion rate: >= 20% of digest items promoted
- RAG query satisfaction: relevant answer within 2 queries
- Cloud LLM fallback rate: < 20% of batch tasks (Ollama handles the rest)
- Zero days with unprocessed queue backlog > 3 days old

---

## 10. Shelved Ideas (for future re-consideration)

### KB-Aware Novelty Summarization
Instead of prompt-only novelty bias, pass existing KB topic tags or recent chunk summaries as context to the summarizer. Ask the LLM to explicitly highlight what is *new* relative to the user's existing knowledge. More accurate but adds tokens/cost. Re-evaluate once KB reaches meaningful size.

### Separate Content Scoring Step
A dedicated `score_content()` LLM call (separate from `summarize()`) that evaluates information density, content style, and novelty independently. Cleaner separation of concerns, potentially more accurate scoring. Worth experimenting with especially if achievable using local LLM at near-zero cost. Currently, content style and information density are extracted as part of `summarize()` output.

### Improved Quote Extraction (Option C — pre-extract + fallback)
Current approach: LLM generates quotes as part of `summarize()` JSON output. Problems: may hallucinate/paraphrase, competing for attention with 6 other fields, format instability.

**Planned approach (3 parts):**
1. **Structured format**: Change prompt to return `{text, speaker}` objects instead of plain strings. Embrace the format the LLM naturally wants to produce. Update frontend to display speaker attribution.
2. **Regex pre-extraction**: Before summarization, extract all real quoted text from the article using patterns (`"..."` + attribution like "said X", "according to X"). Pass candidates into the summarize prompt and ask LLM to select the 1-3 most insightful/controversial. Guarantees verbatim accuracy, zero extra LLM cost.
3. **Fallback for quote-less content**: When regex finds zero candidates (tutorials, opinion pieces, YouTube transcripts), fall back to asking the LLM to extract "key statements" or "key claims" — clearly labeled differently from direct quotes.

**Implementation notes:**
- Regex extractor goes in a new helper (e.g., `text_processing.py`)
- Candidate quotes passed as additional context in `summarize()` user_prompt
- `_normalize_quotes()` in `digest.py` already handles mixed formats
- Frontend quote tab should show speaker attribution when available

---

## 11. Out-of-Scope References
- See `architecture.md` for system design, data model, and deployment
- See `tech_stack.md` for library and tooling decisions
- See `implementation_plan.md` for phased build roadmap
- See `ux_wireframes.md` for screen layouts and interaction flows
