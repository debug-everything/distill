# UX Wireframes
## Distill — Screen Layouts & Interaction Flows
**Version:** 0.3
**References:** prd.md, architecture.md

Legend:
  [Button]     = Clickable button
  (input)      = Text input field
  {value}      = Dynamic / AI-generated content
  >>> arrow    = Navigation result

---

## SCREEN 1: Link Submission (MVP Capture Entry Point)

```
┌──────────────────────────────────────────────────────────┐
│  Distill                    [Digest]  [Knowledge Base]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Add content                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ (Paste an article URL…)                            │  │
│  └────────────────────────────────────────────────────┘  │
│  [Learn Now]                    [Read Later]              │
│  Immediately index to KB        Queue for digest          │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│  Queue  (4 articles)                                     │
│                                                          │
│  How RAG systems fail in production · medium.com         │
│  EU AI Act enforcement timeline · reuters.com            │
│  Claude Haiku 3.5 performance review · anthropic.com     │
│  Kubernetes Gateway API deep dive · cncf.io              │
│                                                          │
│                                      [Process Now]       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Mobile layout:**
```
┌────────────────────────────────┐
│ Distill          [D] [KB]     │
├────────────────────────────────┤
│                                │
│ Add content                    │
│ ┌────────────────────────────┐ │
│ │ (Paste URL…)               │ │
│ └────────────────────────────┘ │
│ [Learn Now]  [Read Later]      │
│                                │
│ ────────────────────────────  │
│ Queue (4)                      │
│ RAG systems fail… medium.com   │
│ EU AI Act… reuters.com         │
│ Claude Haiku… anthropic.com    │
│ K8s Gateway… cncf.io           │
│                [Process Now]   │
└────────────────────────────────┘
```

**Interaction notes:**
- [Learn Now] → POST /api/capture with mode=learn_now → shows inline progress → "Added to KB"
- [Read Later] → POST /api/capture with mode=consume_later → appears in queue
- [Process Now] → POST /api/digest/process → shows processing status → redirects to digest

---

## SCREEN 1B: Learn Now Progress

```
┌──────────────────────────────────────────────────────────┐
│  Processing: "How RAG systems fail in production"        │
│                                                          │
│  [✓] Fetching article                                    │
│  [✓] Extracting content (1,847 words)                    │
│  [◎] Chunking & embedding (4 chunks)                     │
│  [ ] Indexing to knowledge base                          │
│                                                          │
│  ████████████░░░░░░░░  60%                               │
└──────────────────────────────────────────────────────────┘
```

---

## SCREEN 2: Digest Dashboard — Level 0 (Scan View)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Distill   Mon Mar 9 Digest     9 unread                  [+ Add URL]   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ Topics: [All (9)] [AI & ML (4)] [Cloud (3)] [Business (2)]              │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ╔══════════════════════════════════════════════════════════════════════╗ │
│ ║ MERGED  GPT-5: what it changes for AI engineering                   ║ │
│ ║ 4 sources · Reuters, TheVerge, +2 · AI & ML                        ║ │
│ ║ GPT-5 delivers 10x reasoning gains with native tool-calling,       ║ │
│ ║ making unsupervised multi-step agents viable for the first time.   ║ │
│ ║                                         [Open]    [Done]            ║ │
│ ╚══════════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│ ╔══════════════════════════════════════════════════════════════════════╗ │
│ ║ MERGED  Kubernetes Gateway API: migration guide                     ║ │
│ ║ 3 sources · CNCF, kubernetes.io · Cloud                             ║ │
│ ║ Gateway API is now GA and supersedes Ingress for L7 routing.       ║ │
│ ║                                         [Open]    [Done]            ║ │
│ ╚══════════════════════════════════════════════════════════════════════╝ │
│                                                                          │
│ ┌──────────────────────────────────┐  ┌──────────────────────────────┐  │
│ │ EU AI Act: first fines           │  │ Claude Haiku 3.5 launch      │  │
│ │ 1 source · reuters.com           │  │ 1 source · anthropic.com     │  │
│ │ Business                         │  │ AI & ML                      │  │
│ │ Three firms fined for high-risk  │  │ 40% cheaper than previous    │  │
│ │ AI deployment violations…        │  │ Haiku with improved coding…  │  │
│ │          [Open] [Done]           │  │      [Open] [Done]           │  │
│ └──────────────────────────────────┘  └──────────────────────────────┘  │
│                                                                          │
│ ◄ Mar 8  [Today]  Processing… ●                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**Notes:**
- Merged clusters float to top; show source count
- Topic pills filter in real-time (client-side)
- [Open] opens Level 1 drawer without page navigation
- [Done] immediately archives card; unread count decrements
- Date navigation at bottom for digest history
- [Process Now] status shown when processing is active

---

## SCREEN 3: Digest Dashboard — Level 1 Drawer (Summary Tab)

```
┌───────────────────────────────┐  dimmed dashboard behind
│  < Back                    X  │
├───────────────────────────────┤
│ GPT-5: what it changes        │
│    for AI engineering         │
│ 4 sources · AI & ML           │
├───────────────────────────────┤
│ [Summary *] [Highlights]      │
│ [Quotes]    [Sources (4)]     │
├───────────────────────────────┤
│ SUMMARY                       │
│                               │
│ * 10x reasoning improvement   │
│   over GPT-4o; native tool-   │
│   calling without plugins     │
│                               │
│ * Pricing unchanged from      │
│   GPT-4o; enterprise tier     │
│   gets priority throughput    │
│                               │
│ * Multi-step agentic tasks    │
│   now viable without human    │
│   checkpoints per step        │
│                               │
│ * Competitors expected to     │
│   respond within 30 days      │
│                               │
├───────────────────────────────┤
│ SOURCES                       │
│ Reuters · 2h ago         [->] │
│ TheVerge · 3h ago        [->] │
│ TechCrunch · 4h ago      [->] │
│ ArsTechnica · 5h ago     [->] │
├───────────────────────────────┤
│ [Learn This]  [Done]          │
└───────────────────────────────┘
```

---

## SCREEN 4: Digest Dashboard — Level 2 (Sources Tab)

```
┌───────────────────────────────┐
│  < Back                    X  │
│ GPT-5…            4 sources   │
├───────────────────────────────┤
│ [Summary] [Highlights]        │
│ [Quotes]  [Sources *]         │
├───────────────────────────────┤
│                               │
│ SOURCES                       │
│                               │
│ Reuters                       │
│ "OpenAI's GPT-5 achieves      │
│  10x latency reduction…"      │
│ reuters.com · 2h ago     [->] │
│                               │
│ The Verge                     │
│ "Pricing remains at $5/M      │
│  tokens with enterprise       │
│  priority access…"            │
│ theverge.com · 3h ago    [->] │
│                               │
│ TechCrunch                    │
│ "Enterprise customers report  │
│  significant improvements…"   │
│ techcrunch.com · 4h ago  [->] │
│                               │
├───────────────────────────────┤
│ [Learn This]  [Done]          │
└───────────────────────────────┘
```

---

## SCREEN 5: Knowledge Base — RAG Query Interface

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Distill / Knowledge Base                         [Digest] [+ Add]      │
├───────────────────────┬──────────────────────────────────────────────────┤
│  KNOWLEDGE BASE       │  ASK YOUR KNOWLEDGE BASE                        │
│  247 items  12 topics │                                                  │
│                       │  ┌────────────────────────────────────────────┐  │
│  (filter topics)      │  │ (Ask anything from your saved content…)   │  │
│                       │  └─────────────────────────────────────── [>]┘  │
│  AI Engineering       │                                                  │
│     RAG patterns (12) │  ANSWER                                          │
│     Agents (9)        │                                                  │
│     LLM Routing (8)   │  Based on your saved content, key practices      │
│                       │  for Kubernetes networking are [1][2][3]:        │
│  Architecture         │                                                  │
│     Microservices (14)│  * Use **Gateway API** (now GA) over Ingress    │
│     Gateway API (6)   │    for L7 routing [1]                           │
│                       │  * Prefer **eBPF-based CNIs** (Cilium) for      │
│  Cloud Native         │    kernel-level policy enforcement [2]          │
│     Kubernetes (18)   │  * Separate east-west (mesh) from north-south   │
│     Terraform (7)     │    (gateway) traffic [1][3]                     │
│                       │                                                  │
│  247 items total      │  SOURCES                                         │
│  Last sync: 3min ago  │                                                  │
│                       │  [1] Kubernetes Gateway API goes GA              │
│                       │       kubernetes.io · saved Mar 9               │
│                       │       "…Gateway API replaces Ingress for…"      │
│                       │                                                  │
│                       │  [2] k8s-networking.pdf  (uploaded doc)          │
│                       │       p.14 "…eBPF enables kernel-level…"        │
│                       │                                                  │
│                       │  [3] Networking Deep Dive                        │
│                       │       cncf.io                                   │
│                       │       "…east-west traffic handled by mesh…"     │
│                       │                                                  │
│                       │  RELATED QUESTIONS                               │
│                       │  * Difference between Gateway API and Istio?    │
│                       │  * Best CNI for small clusters?                  │
└───────────────────────┴──────────────────────────────────────────────────┘
```

**Mobile layout:** Sidebar collapses; topic browser becomes horizontal scroll or dropdown.

---

## Interaction & Data Flow Summary

```
Capture
  URL paste → [Read Later] → POST /api/capture (mode=consume_later) → queued
  URL paste → [Learn Now]  → POST /api/capture (mode=learn_now) → extract → chunk → embed → KB

On-Demand Processing
  [Process Now] → POST /api/digest/process
  → fetch queued consume_later articles
  → chunk_text [no LLM]
  → summarize() [chat-heavy: qwen2.5:14b → gpt-4o-mini fallback]
  → tag_topics() [chat-light]
  → embed(headlines) [embedder] → cosine cluster [no LLM]
  → merged cluster summary [chat-heavy] if 2+ items
  → write clusters to Neon

Nightly Batch (9pm)
  APScheduler triggers same processing logic automatically

Dashboard (Level 0 → 1 → 2)
  GET /api/digest → card grid
  Click [Open] → drawer (bullets, sources)
  Click tabs → Highlights / Quotes / Sources
  Click [Learn This] → embed to knowledge base
  Click [Done] → archive cluster

RAG Query
  User types question
  → embed(question) [same model as docs — enforced]
  → pgvector cosine search top-5
  → rag_answer(question, context) [chat-heavy]
  → answer + citations [1][2][3]
  → source cards
```
