# AI Engineering Patterns in Distill
**Last Updated:** March 2026

A rundown of the AI/LLM patterns I've implemented in Distill, how they work, and where to find them in the codebase.

---

## 1. Architecture

### 1.1 Centralized LLM Dispatch
All AI calls route through one file: `task_router.py`. No other module imports LiteLLM or knows about model names/providers. This gives me a single point for routing, instrumentation, cost tracking, and prompt management.

```mermaid
graph LR
    DP[digest_processor] --> TR[task_router.py]
    KS[knowledge_service] --> TR
    FS[feed_service] --> TR
    FD[feed api] --> TR
    TR --> |LiteLLM| OL[Ollama]
    TR --> |LiteLLM| CL[Cloud LLMs]
    TR --> UT[usage_tracker]
```

`backend/app/core/task_router.py`
- Functions: `summarize()`, `embed()`, `tag_topics()`, `rag_answer()`, `score_quality()`, `unpack_sections()`
- Callers (digest_processor, knowledge_service, feed_service) only call these functions

### 1.2 Adaptive Inference Routing with Fallback Chain
Local-first routing that tries Ollama, then cascades through cloud providers. Configured per task tier (heavy vs light) with three modes: `auto`, `cloud`, `local`.

```mermaid
flowchart TD
    REQ[AI call] --> MODE{LLM mode?}
    MODE -->|local| OL_ONLY[Ollama]
    MODE -->|cloud| CLOUD
    MODE -->|auto| OL_TRY[Try Ollama]
    OL_TRY -->|reachable| OL_USE[Use Ollama]
    OL_TRY -->|down| CLOUD
    OL_ONLY -->|down| ERR[RuntimeError]

    subgraph CLOUD [Cloud Fallback Chain]
        direction LR
        C1[cohere/command-r] -->|fail| C2[gpt-4o-mini] -->|fail| C3[claude-haiku-3.5]
    end
```

`backend/app/core/task_router.py`
- `_should_use_local(tier)` checks mode config + Ollama health
- `_cloud_completion(task_name, **kwargs)` tries cloud models in order, logs each attempt
- Two tiers: "heavy" (summarize, RAG, unpack) and "light" (tagging, scoring, embedding)

### 1.3 Background Processing with Status Tracking
Long-running LLM pipelines run as async background tasks. API endpoints return immediately. The frontend polls for progress.

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant API as FastAPI
    participant BG as Background Task
    participant LLM as LLM (local/cloud)

    FE->>API: POST /api/digests/process
    API->>BG: create_task()
    API-->>FE: 200 OK (started)
    loop Poll every 2s
        FE->>API: GET /api/digests/processing-status
        API-->>FE: {current: 3, total: 5, stage: "Summarizing..."}
    end
    BG->>LLM: summarize(), tag_topics(), embed()
    BG->>API: Update status object
    FE->>API: GET /api/digests/processing-status
    API-->>FE: {is_processing: false, last_result: {...}}
```

- `backend/app/services/digest_processor.py` — `start_processing_in_background()`
- `backend/app/services/knowledge_service.py` — `start_learn_now_in_background()`
- `backend/app/services/feed_service.py` — `start_fetch_in_background()`
- Each has a status object tracking: `is_processing`, `current`/`total`, `stage`, `llm_mode`

### 1.4 Debounced Auto-Processing
Captures trigger a deferred processing timer. Each new capture resets the timer (cancelable `asyncio.Task` with sleep). This avoids redundant pipeline runs when multiple items are captured in quick succession.

```mermaid
sequenceDiagram
    participant U as User
    participant API as Capture API
    participant T as Debounce Timer

    U->>API: Capture article #1
    API->>T: schedule(30s)
    Note over T: Timer starts
    U->>API: Capture article #2 (10s later)
    API->>T: schedule(30s)
    Note over T: Timer resets
    U->>API: Capture article #3 (5s later)
    API->>T: schedule(30s)
    Note over T: Timer resets again
    Note over T: 30s pass with no captures...
    T->>API: start_processing_in_background()
```

`backend/app/services/digest_processor.py` — `schedule_deferred_processing()`
- Configurable delay via `DIGEST_AUTO_PROCESS_DELAY_SECONDS` (default 30s)

---

## 2. RAG (Retrieval-Augmented Generation)

### 2.1 Full RAG Pipeline
End-to-end: chunk, embed, store, retrieve, augment, generate with citations.

```mermaid
flowchart LR
    subgraph Indexing
        direction TB
        A[Article text] --> CH["chunk_text<br/>512 chars, 50 overlap"]
        CH --> EM["embed<br/>768d vectors"]
        EM --> PG[("pgvector<br/>HNSW index")]
    end

    subgraph Query
        direction TB
        Q[User question] --> QE["embed question<br/>same model"]
        QE --> CS["Cosine search<br/>top-5, min 0.3"]
        CS --> DD[Dedup by source]
        DD --> RA["rag_answer<br/>chat-heavy"]
        RA --> R["Answer + [1][2] citations"]
    end

    PG -.-> CS
```

**Indexing path:**
1. Content chunked via `RecursiveCharacterTextSplitter` (512 chars, 50 overlap)
2. Chunks embedded via `embed()` (768d vectors)
3. Stored in pgvector with HNSW index

**Query path:**
1. Question embedded with same model (embedding consistency enforced by the single `embed()` entry point)
2. pgvector cosine similarity search, top-5 chunks, min similarity 0.3
3. Chunks deduplicated by source, formatted as `[Source N]: {text}`
4. `rag_answer()` generates a response with inline `[1][2]` citations + related questions

Relevant files:
- Indexing: `backend/app/services/knowledge_service.py`
- Retrieval + generation: `backend/app/api/rag.py`, `backend/app/core/task_router.py`
- Chunking: `backend/app/services/text_processing.py`

### 2.2 Conversation History in RAG
The client maintains ephemeral Q&A history (session-scoped, not persisted). It's sent with each query. The backend trims to ~4000 chars (whole exchanges, walking backward) and injects into the prompt. This enables follow-ups like "tell me more" without server-side session state.

```mermaid
flowchart LR
    subgraph Client [Frontend - session only]
        H["history[ ]<br/>Q&A pairs"]
    end
    H -->|send with query| BE[Backend]
    BE --> TRIM["_trim_history()<br/>~4000 char budget<br/>whole exchanges only"]
    TRIM --> PROMPT["Inject into<br/>rag_answer prompt"]
```

`backend/app/core/task_router.py` — `_trim_history()`

### 2.3 Embedding Consistency
Query and document embeddings must use the same model. I enforce this architecturally: a single `embed()` function is the only code path for all embedding. Both local (nomic-embed-text) and cloud (text-embedding-3-small) produce 768d vectors.

```mermaid
graph TD
    DOC[Document chunks] --> E["embed()"]
    Q[Query text] --> E
    CLUSTER[Headline clustering] --> E
    E --> |local| NOM["nomic-embed-text<br/>768d"]
    E --> |cloud fallback| OAI["text-embedding-3-small<br/>dimensions=768"]
    NOM --> V["Compatible<br/>768d vector space"]
    OAI --> V
```

`backend/app/core/task_router.py` — `embed()`

---

## 3. Prompt Engineering

### 3.1 Structured JSON Output
All LLM calls that need structured data use `response_format={"type": "json_object"}` with explicit field definitions in the prompt. Parsed with `json.loads()` and validated.

```mermaid
flowchart LR
    P["Prompt:<br/>field definitions<br/>+ 'Output valid JSON only'"] --> LLM
    LLM -->|"response_format:<br/>json_object"| RAW[Raw JSON string]
    RAW --> PARSE["json.loads()"]
    PARSE --> DATA[Typed dict]
```

Used by: `summarize()`, `unpack_sections()`, `rag_answer()`, `tag_topics()`

### 3.2 Novelty-Biased Summarization
The prompts explicitly tell the model to skip common knowledge and surface what's novel, surprising, or contrarian. Bullets prioritize counterintuitive findings. Quotes prefer controversial or uniquely insightful selections.

`backend/app/core/task_router.py` — `summarize()` system and user prompts

### 3.3 User Context Injection (Focused Topics)
User-configured interest topics get injected into prompts at runtime. I cache them in memory and refresh at pipeline start. This affects summarization depth, topic tagging, and RAG answer bias.

```mermaid
flowchart TD
    DB[("user_settings<br/>focused_topics")] -->|pipeline start| CACHE["In-memory cache"]
    CACHE --> SUM["summarize()<br/>'reader is interested in: ...'"]
    CACHE --> TAG["tag_topics()<br/>'also consider: ...'"]
    CACHE --> RAG["rag_answer()<br/>'lean toward these topics'"]
    CACHE --> UNP["unpack_sections()<br/>'emphasize related sections'"]
    CACHE --> SCORE["topic_match_score<br/>tags ∩ focused_topics"]
```

- Cache: `_focused_topics_cache` in `task_router.py`, refreshed by `refresh_focused_topics()`
- Injected into: `summarize()`, `unpack_sections()`, `tag_topics()`, `rag_answer()`
- Scoring: `topic_match_score` in feed items = count of tags intersecting focused topics

### 3.4 Progressive Summarization
Two-tier summarization for progressive drill-down:
- **Level 1:** `summarize()` produces headline + summary + bullets + quotes
- **Level 2:** `unpack_sections()` breaks content into 3-5 key sections with mini-summaries

```mermaid
flowchart LR
    A[Full article] --> L1["Level 1: summarize()<br/>headline + summary<br/>+ bullets + quotes"]
    L1 -->|user clicks Unpack| L2["Level 2: unpack_sections()<br/>3-5 sections with<br/>mini-summaries"]
    L2 -->|video| TS["+ ▶ MM:SS<br/>timestamp links"]
```

Both are topic-aware and video-aware (timestamps included when `is_video=True`).

### 3.5 Content Classification via Summarization
The `summarize()` prompt extracts structured metadata alongside the summary:
- `content_style` — one of 8 types: tutorial, demo, opinion, interview, news, analysis, narrative, review
- `information_density` — 1-10 scale rating substantive content density

```mermaid
flowchart LR
    A[Article text] --> S["summarize()<br/>single LLM call"]
    S --> SUM["headline + summary<br/>+ bullets + quotes"]
    S --> META["content_style: 'tutorial'<br/>information_density: 8"]
    META --> SORT["Secondary sort key<br/>on digest page"]
    META --> BADGE["Badges on<br/>digest tiles"]
```

I use these for sorting (density as secondary sort key) and display (badges on digest tiles).

---

## 4. Content Intelligence

### 4.1 Video Demo Detection (Heuristic Fusion)
I classify YouTube videos as demos/tutorials using two independent signal sources, no LLM needed:
- **Transcript patterns:** 18 regex patterns detect demo cues ("as you can see", "let me show", "click on", etc.)
- **Description analysis:** Keyword matching for tutorial/demo signals + timestamp counting

```mermaid
flowchart TD
    V[YouTube video] --> T[Transcript text]
    V --> D[Description text]
    T --> DC["_detect_demo_cues()<br/>18 regex patterns"]
    D --> DA["_analyze_description()<br/>keyword + timestamp check"]
    DC --> |"has_demo_cues<br/>cue_density/1k words"| CA[content_attributes]
    DA --> |"has_timestamps<br/>demo_keywords"| CA
    CA --> BADGE["'Screen demo' badge<br/>on digest tile"]
```

Outputs: `has_demo_cues`, `demo_cue_count`, `demo_cue_density` (per 1k words), `has_timestamps`

`backend/app/services/video_extractor.py` — `_detect_demo_cues()`, `_analyze_description()`

### 4.2 Vector Similarity Clustering
Groups related articles using cosine similarity on headline embeddings. Purely mathematical (numpy), no LLM cost. Multi-article clusters trigger merged re-summarization.

```mermaid
flowchart LR
    A1["Article 1<br/>headline"] --> E["embed()"]
    A2["Article 2<br/>headline"] --> E
    A3["Article 3<br/>headline"] --> E
    A4["Article 4<br/>headline"] --> E
    E --> SIM["cosine similarity<br/>matrix (numpy)"]
    SIM -->|"≥ 0.88"| CL1["Cluster: A1 + A2<br/>merged summary"]
    SIM -->|"< 0.88"| CL2["Cluster: A3<br/>single article"]
    SIM -->|"< 0.88"| CL3["Cluster: A4<br/>single article"]
```

`backend/app/services/text_processing.py` — `cluster_by_similarity()` (threshold: 0.88)

### 4.3 Automated Topic Tagging
LLM-based classification into 1-3 topic labels from a predefined taxonomy, augmented with user-specific focused topics. Uses the light model tier for speed/cost.

`backend/app/core/task_router.py` — `tag_topics()`

### 4.4 Content-Aware Extraction Routing
URL dispatcher that routes to specialized extractors based on content type:
- Articles: httpx + readability-lxml
- YouTube: youtube-transcript-api + metadata scraping
- (Future) PDFs, newsletters

```mermaid
flowchart TD
    URL[User URL] --> DET{URL pattern?}
    DET -->|"youtube.com<br/>youtu.be"| VE["video_extractor<br/>youtube-transcript-api<br/>+ oembed + page scrape"]
    DET -->|everything else| AE["article_extractor<br/>httpx + readability-lxml"]
    DET -.->|future| PE["pdf_extractor<br/>PyMuPDF"]
    VE --> ER[ExtractionResult]
    AE --> ER
```

`backend/app/services/content_extractor.py` — `extract_content()`

---

## 5. Observability and Cost Management

### 5.1 LLM Usage Tracking with Cost Attribution
Every LLM call records: task type, model, provider (local/cloud), input/output tokens, cost (USD). I buffer these in memory and flush to DB every 60s. Cloud costs are calculated via LiteLLM's `completion_cost()`, local costs are $0.

```mermaid
flowchart LR
    AI["Any AI call"] --> RU["record_usage()<br/>extract tokens + cost"]
    RU --> BUF["In-memory buffer"]
    BUF -->|"every 60s"| DB[(llm_usage table)]
    DB --> API["GET /api/stats<br/>totals, by-task,<br/>daily, recent"]
```

`backend/app/core/usage_tracker.py`

### 5.2 Provider Telemetry
Tracks which provider is active (local vs cloud) and whether inference is in flight. "Sticky" mode: once cloud is used in a pipeline run, it stays cloud. Exposed via API so the frontend can show "running locally" vs "using cloud".

```mermaid
stateDiagram-v2
    [*] --> idle: reset()
    idle --> local: Ollama call succeeds
    idle --> cloud: Cloud call made
    local --> cloud: Cloud call made
    cloud --> cloud: More calls (sticky)
    local --> local: More local calls
    note right of cloud: Once cloud is used,<br/>stays cloud for<br/>the pipeline run
```

`backend/app/core/task_router.py` — `LLMTracker` class

---

## 6. Resilience

### 6.1 Graceful Degradation
Every AI function has fallback behavior when inference fails:
- Failed tagging defaults to `["General"]`
- Failed scoring defaults to `7`
- Failed local inference falls back to cloud (in auto mode)
- Failed cloud inference cascades through the fallback chain
- Missing content filled with safe defaults

```mermaid
flowchart TD
    CALL[AI function call] --> TRY{Local model}
    TRY -->|success| OK[Return result]
    TRY -->|fail + auto mode| C1{cohere/command-r}
    TRY -->|fail + local mode| ERR[Raise error]
    C1 -->|success| OK
    C1 -->|fail| C2{gpt-4o-mini}
    C2 -->|success| OK
    C2 -->|fail| C3{claude-haiku-3.5}
    C3 -->|success| OK
    C3 -->|fail| DEF["Safe default<br/>tags → General<br/>score → 7"]
```

### 6.2 Friendly Error Translation
Verbose extraction errors (YouTube transcript failures, timeouts, 403s) get mapped to concise user-facing messages before returning to the frontend.

`backend/app/api/feed.py` — `_friendly_extraction_error()`

### 6.3 On-Demand Summarization with DB Caching
Feed items are summarized on demand, not upfront. Results are cached on the `feed_items` row. Subsequent requests return instantly from cache.

```mermaid
flowchart TD
    REQ["POST /api/feed/id/summarize"] --> CHK{Already summarized?}
    CHK -->|yes| RET[Return cached summary]
    CHK -->|no| EXT["Extract content<br/>from URL"]
    EXT --> SUM["summarize()<br/>chat-heavy"]
    SUM --> SAVE["Cache to<br/>feed_items row"]
    SAVE --> RET
```

`backend/app/api/feed.py` — `POST /api/feed/{id}/summarize`

---

## 7. Security

### 7.1 SSRF Protection
All outbound HTTP requests to user-provided URLs are validated against private/reserved IP ranges. URLs are reconstructed from parsed components to break taint flow for static analysis tools.

`backend/app/core/security.py` — `validate_url()`

### 7.2 Log Injection Prevention
User-controlled input (URLs, titles, source names) is sanitized before logging. I use `%s` formatting (not f-strings) with `sanitize_log()` to strip newlines, carriage returns, and ANSI escapes.

`backend/app/core/security.py` — `sanitize_log()`

---

## 8. Not Yet Implemented

| Pattern | Description | Complexity |
|---------|-------------|------------|
| **Agentic Workflow** | Multi-step reasoning chain: extract claims, check KB for novelty, rate relevance, score quality, rank | High |
| **Chain-of-Thought** | Add "think step by step" reasoning to quality scoring and content evaluation | Low |
| **Few-Shot Prompting** | Include example summaries in prompts to improve output consistency | Low |
| **KB-Aware Novelty** | Query KB before summarizing to suppress already-known information (shelved in PRD S10) | Medium |
| **Hybrid Vector Search** | Combine cosine similarity with metadata filters (topic, date, content type) in RAG retrieval | Medium |
| **Quality Gate Pipeline** | Reject low-scoring summaries and re-summarize with different prompts or models | Low |
| **Reflection/Self-Critique** | LLM reviews its own output and refines before returning | Medium |
| **Tool Use** | Give the LLM access to tools (web search, calculator, KB query) during RAG answering | High |
