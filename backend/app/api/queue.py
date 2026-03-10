from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func, or_, and_
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


class QueueSection(BaseModel):
    items: list[QueueItem]
    total: int


class QueueResponse(BaseModel):
    consume_later: QueueSection
    learn_now: QueueSection


def _to_item(a: "Article") -> QueueItem:
    return QueueItem(
        id=str(a.id),
        url=a.url,
        title=a.title,
        source_domain=a.source_domain,
        mode=a.mode,
        status=a.status,
        extraction_quality=a.extraction_quality or "ok",
        created_at=a.created_at.isoformat(),
    )


@router.get("/api/articles", response_model=QueueResponse)
async def list_articles(db: AsyncSession = Depends(get_db)):
    """List articles, split by mode."""

    # Consume later: queued or processing
    cl_result = await db.execute(
        select(Article)
        .where(
            Article.mode == "consume_later",
            Article.status.in_(["queued", "processing"]),
        )
        .order_by(Article.created_at.desc())
    )
    cl_articles = cl_result.scalars().all()

    # Learn now: indexing or recently indexed (last 20)
    ln_result = await db.execute(
        select(Article)
        .where(
            Article.mode == "learn_now",
            Article.status.in_(["indexing", "kb_indexed", "failed"]),
        )
        .order_by(Article.created_at.desc())
        .limit(20)
    )
    ln_articles = ln_result.scalars().all()

    return QueueResponse(
        consume_later=QueueSection(
            items=[_to_item(a) for a in cl_articles],
            total=len(cl_articles),
        ),
        learn_now=QueueSection(
            items=[_to_item(a) for a in ln_articles],
            total=len(ln_articles),
        ),
    )
