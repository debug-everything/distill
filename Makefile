.PHONY: dev dev-backend dev-frontend install kill restart db db-stop db-reset migrate

# Start both backend and frontend concurrently
dev:
	@trap 'kill 0' EXIT; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && pnpm dev

install:
	cd backend && uv sync
	cd frontend && pnpm install

# Kill orphaned dev servers (use after accidental Ctrl+Z)
kill:
	@lsof -ti :8000 | xargs kill -9 2>/dev/null; true
	@lsof -ti :3000 | xargs kill -9 2>/dev/null; true
	@echo "Killed dev servers on ports 8000 and 3000"
	@sleep 1

# Kill orphaned servers then start fresh
restart: kill dev

# Database (local Docker pgvector)
db:
	docker compose up -d db
	@echo "Postgres running on localhost:5432"

db-stop:
	docker compose down

db-reset:
	docker compose down -v
	@echo "Database volume removed — next 'make db' starts fresh"

migrate:
	cd backend && uv run alembic upgrade head
