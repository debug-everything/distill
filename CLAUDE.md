# Distill

Personal AI-powered knowledge digest system. Local-first, single-user.

## Docs

All design docs live in `/docs/` — read these before making architectural changes:
- `prd.md` — Product requirements and scope
- `architecture.md` — System design, data model, pipelines
- `tech_stack.md` — Library choices and rationale
- `implementation_plan.md` — Phased roadmap (0-5)
- `ux_wireframes.md` — UI wireframes

## Project Structure

```
/backend    — FastAPI (Python 3.13, uv)
/frontend   — Next.js App Router (pnpm, shadcn/ui, Tailwind, Zustand, TanStack Query)
/docs       — Design documentation
```

## Dev Commands

```bash
make dev          # starts both backend (8000) and frontend (3000)
make install      # install deps for both
```

Backend: `cd backend && uv run uvicorn app.main:app --reload`
Frontend: `cd frontend && pnpm dev`
Storybook: `cd frontend && pnpm storybook` (localhost:6006) — UI mockups and component playground

### Database

```bash
make db           # start local pgvector (Docker, port 5432)
make db-stop      # stop the container
make db-reset     # destroy volume and start fresh
make migrate      # run Alembic migrations (alembic upgrade head)
```

Local Docker and remote Neon are interchangeable — swap the `DATABASE_URL` in `.env`. SSL is auto-enabled only when the URL contains "neon".

## Key Conventions

- **Package managers**: `uv` for Python, `pnpm` for JS. Never use pip/npm/yarn.
- **API proxy**: Next.js rewrites `/api/*` and `/health` to FastAPI (localhost:8000). No direct DB access from frontend.
- **AI calls**: All LLM/embedding calls go through `backend/app/core/task_router.py` via LiteLLM. Ollama local-first, cloud fallback.
- **DB**: Postgres + pgvector. Local Docker (`pgvector/pgvector:pg17`) or remote Neon — configured via `DATABASE_URL` in `.env`. SSL auto-enabled for Neon. Alembic for migrations.
- **Settings**: Client-side preferences (theme, text size, tile format/layout) in Zustand with `persist` middleware.
- **Long-running tasks**: Process endpoints return immediately, work runs in background asyncio tasks. Frontend polls status.
- **Design Philosophy**: Avoid bloated and code duplications. Favor known design patterns, DRY, low-coupling and high-cohesion.

## Working Style

- For major redesigns or new features: plan first, share summary, then implement.
- For minor UI/cosmetic changes or bug fixes: go straight to implementation.
- Ask clarifying questions on intent or preferences instead of making assumptions.
- Push back or suggest better alternatives when appropriate.
- Run typecheck + lint before considering a task done (`cd frontend && pnpm build`, `cd backend && uv run python -m py_compile app/main.py`).
- Update docs in `/docs/` whenever architecture, design decisions, or requirements change.
- Keep `docs/implementation_plan.md` current: mark tasks done after completing them, add new tasks when planning or brainstorming.
- Always evaluate tech design against industry best practices such as RESTful API and other engineering principles.
- Identify opportunities to leverage Agentic AI and/or AI Workflow Patterns (e.g., chain-of-thought, reflection, tool use, planning). Refactor code to follow applicable patterns.
