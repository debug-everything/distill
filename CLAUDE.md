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
Migrations: `cd backend && uv run alembic upgrade head`

## Key Conventions

- **Package managers**: `uv` for Python, `pnpm` for JS. Never use pip/npm/yarn.
- **API proxy**: Next.js rewrites `/api/*` and `/health` to FastAPI (localhost:8000). No direct DB access from frontend.
- **AI calls**: All LLM/embedding calls go through `backend/app/core/task_router.py` via LiteLLM. Ollama local-first, cloud fallback.
- **DB**: Neon Postgres + pgvector. SSL via `truststore` (injected at top of `main.py`). Alembic for migrations.
- **Settings**: Client-side preferences (theme, text size, tile format/layout) in Zustand with `persist` middleware.
- **Long-running tasks**: Process endpoints return immediately, work runs in background asyncio tasks. Frontend polls status.

## Working Style

- For major redesigns or new features: plan first, share summary, then implement.
- For minor UI/cosmetic changes or bug fixes: go straight to implementation.
- Ask clarifying questions on intent or preferences instead of making assumptions.
- Push back or suggest better alternatives when appropriate.
- Run typecheck + lint before considering a task done (`cd frontend && pnpm build`, `cd backend && uv run python -m py_compile app/main.py`).
- Update docs in `/docs/` whenever architecture, design decisions, or requirements change.
