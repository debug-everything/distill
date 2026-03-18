# Distill

A personal AI-powered knowledge digest system. Think Perplexity Discover meets read-it-later and Feedly, running on your own hardware.

I built this to solve my own "Pocket graveyard" problem. Saving dozens of articles and YouTube videos every week, accumulating cobwebs of bookmarks, never actually finding time to read them, and forgetting where I saw something useful three months later.

Distill captures URLs, summarizes them into scannable digests, clusters related content, and lets you promote the good stuff into a searchable personal knowledge base with RAG. It also doubles as a feed reader curated around topics I actually care about.

## How it works

**Two capture modes:**
- **Consume Later** queues content for batch digest processing. Distill summarizes, scores, clusters, and presents everything as a daily-ish digest.
- **Learn Now** immediately extracts, chunks, embeds, and indexes content into your knowledge base for RAG queries.

**Feed reader.** Subscribe to RSS feeds and YouTube channels. Distill fetches new items, scores them against your focused topics, and lets you summarize or capture on demand.

**Local-first AI.** All LLM and embedding calls run through Ollama on your own machine (llama3.1, qwen2.5, nomic-embed-text). Cloud models (gpt-4o-mini, claude-haiku-3.5) kick in automatically only if Ollama is down.

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js (App Router), Tailwind, shadcn/ui, Zustand, TanStack Query |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic |
| Database | Postgres + pgvector |
| AI | Ollama (local-first), LiteLLM, OpenAI/Anthropic fallback |
| Package managers | uv (Python), pnpm (JS) |

## Getting started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Docker (for local Postgres)
- [Ollama](https://ollama.ai/) with models pulled:
  ```bash
  ollama pull llama3.1:8b
  ollama pull nomic-embed-text
  ```

### Setup

```bash
# Clone and install
git clone <repo-url> && cd distill
make install

# Copy env and fill in your values
cp .env.example .env

# Start local Postgres
make db

# Run migrations
make migrate

# Start everything
make dev
```

This starts the backend on `localhost:8000` and frontend on `localhost:3000`.

### Environment

See `.env.example` for all configuration options. The important ones:

- `DATABASE_URL` - Postgres connection string
- `OLLAMA_BASE_URL` - defaults to `http://localhost:11434`
- `LLM_MODE_HEAVY` / `LLM_MODE_LIGHT` - `auto` (local-first), `cloud`, or `local`
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` - only needed if you want cloud fallback

## Project structure

```
backend/          FastAPI app (Python 3.13, uv)
frontend/         Next.js app (pnpm, shadcn/ui)
docs/             Design docs (PRD, architecture, tech stack, implementation plan)
```

All AI calls go through a single file: `backend/app/core/task_router.py`. No model names or provider logic anywhere else in the codebase.

## Development

```bash
make dev          # starts backend + frontend
make db           # start local Postgres (Docker)
make db-stop      # stop Postgres
make db-reset     # nuke and restart Postgres
make migrate      # run Alembic migrations
```

Storybook is available for UI mockups:
```bash
cd frontend && pnpm storybook
```

## Status

This is a personal learning/portfolio project. It's functional and I use it daily, but it's not designed for multi-user deployment. See `docs/implementation_plan.md` for the roadmap.

## License

MIT
