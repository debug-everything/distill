import truststore
truststore.inject_into_ssl()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.capture import router as capture_router
from app.api.digest import router as digest_router
from app.api.health import router as health_router
from app.api.queue import router as queue_router
from app.api.rag import router as rag_router

app = FastAPI(title="Distill", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(capture_router)
app.include_router(queue_router)
app.include_router(digest_router)
app.include_router(rag_router)
