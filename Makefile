.PHONY: dev dev-backend dev-frontend install kill restart

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
