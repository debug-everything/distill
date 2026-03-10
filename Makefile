.PHONY: dev dev-backend dev-frontend install

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
