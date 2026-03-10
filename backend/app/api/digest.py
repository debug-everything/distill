from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.database import Article, Cluster, ClusterSource
from app.services.digest_processor import start_processing_in_background, status as processing_status
from app.services.knowledge_service import index_articles_to_kb

router = APIRouter()


class SourceItem(BaseModel):
    article_id: str
    source_url: str
    source_name: str | None
    content_type: str
    image_url: str | None = None


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


class DigestPatchRequest(BaseModel):
    status: str


@router.post("/api/digests/process")
async def trigger_process():
    """Trigger on-demand digest processing in the background."""
    return start_processing_in_background()


@router.get("/api/digests/processing-status")
async def get_processing_status():
    """Get current digest processing status."""
    return processing_status.to_dict()


@router.get("/api/digests", response_model=DigestResponse)
async def get_digests(
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
                        image_url=s.image_url,
                    )
                    for s in c.sources
                ],
            )
            for c in clusters
        ],
    )


@router.patch("/api/digests/{cluster_id}")
async def update_digest(cluster_id: str, req: DigestPatchRequest, db: AsyncSession = Depends(get_db)):
    """Update a digest cluster's status."""
    if req.status not in ("done", "unread"):
        raise HTTPException(status_code=400, detail="status must be 'done' or 'unread'")
    await db.execute(
        update(Cluster).where(Cluster.id == cluster_id).values(status=req.status)
    )
    await db.commit()
    return {"ok": True}


@router.post("/api/digests/{cluster_id}/promote")
async def promote_to_kb(cluster_id: str, db: AsyncSession = Depends(get_db)):
    """Promote a cluster's articles to the knowledge base."""
    result = await db.execute(
        select(ClusterSource.article_id).where(ClusterSource.cluster_id == cluster_id)
    )
    article_ids = [row[0] for row in result.all()]

    if not article_ids:
        return {"ok": False, "detail": "No articles found for this cluster"}

    index_result = await index_articles_to_kb(article_ids, db)

    await db.execute(
        update(Cluster).where(Cluster.id == cluster_id).values(status="promoted")
    )
    await db.commit()

    return {
        "ok": True,
        "indexed": index_result["indexed"],
        "failed": index_result["failed"],
    }
