from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.task_router import _ollama_available

router = APIRouter()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    # Check DB
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    # Check Ollama
    ollama_status = "ok" if await _ollama_available() else "unavailable"

    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        "ollama": ollama_status,
        "env": settings.runtime_env,
    }
