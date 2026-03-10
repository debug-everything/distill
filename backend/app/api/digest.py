from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.database import Cluster, ClusterSource
from app.services.digest_processor import start_processing_in_background, status as processing_status

router = APIRouter()


class SourceItem(BaseModel):
    article_id: str
    source_url: str
    source_name: str | None
    content_type: str


class ClusterItem(BaseModel):
    id: str
    digest_date: str
    title: str
    headline: str
    summary: str
    bullets: list[str]
    quotes: list[str]
    topic_tags: list[str]
    source_count: int
    is_merged: bool
    status: str
    sources: list[SourceItem]


class DigestResponse(BaseModel):
    clusters: list[ClusterItem]
    date: str


@router.post("/api/digest/process")
async def trigger_process():
    """Trigger on-demand digest processing in the background."""
    return start_processing_in_background()


@router.get("/api/digest/status")
async def get_processing_status():
    """Get current processing status."""
    return processing_status.to_dict()


@router.get("/api/digest", response_model=DigestResponse)
async def get_digest(
    digest_date: str | None = None, db: AsyncSession = Depends(get_db)
):
    """Get digest clusters for a given date (defaults to today)."""
    target_date = date.fromisoformat(digest_date) if digest_date else date.today()

    result = await db.execute(
        select(Cluster)
        .where(Cluster.digest_date == target_date)
        .options(selectinload(Cluster.sources))
        .order_by(Cluster.is_merged.desc(), Cluster.created_at.desc())
    )
    clusters = result.scalars().all()

    return DigestResponse(
        date=target_date.isoformat(),
        clusters=[
            ClusterItem(
                id=str(c.id),
                digest_date=c.digest_date.isoformat(),
                title=c.title,
                headline=c.headline,
                summary=c.summary,
                bullets=c.bullets if isinstance(c.bullets, list) else [],
                quotes=c.quotes if isinstance(c.quotes, list) else [],
                topic_tags=c.topic_tags or [],
                source_count=c.source_count,
                is_merged=c.is_merged,
                status=c.status,
                sources=[
                    SourceItem(
                        article_id=str(s.article_id),
                        source_url=s.source_url,
                        source_name=s.source_name,
                        content_type=s.content_type,
                    )
                    for s in c.sources
                ],
            )
            for c in clusters
        ],
    )


@router.post("/api/digest/{cluster_id}/done")
async def mark_done(cluster_id: str, db: AsyncSession = Depends(get_db)):
    """Archive a cluster."""
    await db.execute(
        update(Cluster).where(Cluster.id == cluster_id).values(status="done")
    )
    await db.commit()
    return {"ok": True}
