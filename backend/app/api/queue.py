from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import Article

router = APIRouter()


class QueueItem(BaseModel):
    id: str
    url: str
    title: str | None
    source_domain: str | None
    mode: str
    status: str
    extraction_quality: str
    created_at: str


class QueueResponse(BaseModel):
    items: list[QueueItem]
    total: int


@router.get("/api/queue", response_model=QueueResponse)
async def get_queue(db: AsyncSession = Depends(get_db)):
    """Get all queued (unprocessed) articles."""
    result = await db.execute(
        select(Article)
        .where(Article.status == "queued", Article.mode == "consume_later")
        .order_by(Article.created_at.desc())
    )
    articles = result.scalars().all()

    count_result = await db.execute(
        select(func.count())
        .select_from(Article)
        .where(Article.status == "queued", Article.mode == "consume_later")
    )
    total = count_result.scalar() or 0

    return QueueResponse(
        items=[
            QueueItem(
                id=str(a.id),
                url=a.url,
                title=a.title,
                source_domain=a.source_domain,
                mode=a.mode,
                status=a.status,
                extraction_quality=a.extraction_quality or "ok",
                created_at=a.created_at.isoformat(),
            )
            for a in articles
        ],
        total=total,
    )
