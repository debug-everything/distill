import truststore
truststore.inject_into_ssl()

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.capture import router as capture_router
from app.api.digest import router as digest_router
from app.api.health import router as health_router
from app.api.queue import router as queue_router
from app.api.rag import router as rag_router
from app.api.settings import router as settings_router
from app.api.feed import router as feed_router
from app.api.stats import router as stats_router
from app.api.documents import router as documents_router
from app.core.task_router import llm_tracker
from app.core import usage_tracker


@asynccontextmanager
async def lifespan(app: FastAPI):
    usage_tracker.start_flush_loop()
    yield
    await usage_tracker.final_flush()


app = FastAPI(title="Distill", version="0.1.0", lifespan=lifespan)

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
app.include_router(settings_router)
app.include_router(feed_router)
app.include_router(stats_router)
app.include_router(documents_router)


@app.get("/api/llm-status")
async def get_llm_status():
    return llm_tracker.to_dict()
