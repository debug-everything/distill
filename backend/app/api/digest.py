from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.database import Article, Cluster, ClusterSource
from app.core.task_router import refresh_focused_topics, unpack_sections
from app.services.digest_processor import start_processing_in_background, status as processing_status
from app.services.knowledge_service import index_articles_to_kb

router = APIRouter()


class UnpackSection(BaseModel):
    title: str
    content: str


class UnpackResponse(BaseModel):
    ok: bool
    sections: list[UnpackSection]


class SourceItem(BaseModel):
    article_id: str
    source_url: str
    source_name: str | None
    content_type: str
    extraction_quality: str
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
    content_style: str | None = None
    information_density: int | None = None
    content_attributes: dict | None = None
    unpacked_sections: list[UnpackSection] | None = None
    source_count: int
    is_merged: bool
    status: str
    sources: list[SourceItem]


class DigestResponse(BaseModel):
    clusters: list[ClusterItem]
    has_more: bool


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


def _normalize_quotes(quotes) -> list[str]:
    """Normalize quotes from various LLM output formats to plain strings."""
    if not isinstance(quotes, list):
        return []
    result = []
    for q in quotes:
        if isinstance(q, str) and q.strip():
            result.append(q)
        elif isinstance(q, dict):
            # LLM may return {"text": "...", "speaker": "..."} or {"quote": "..."}
            text = q.get("text") or q.get("quote") or ""
            speaker = q.get("speaker") or q.get("speaker_name") or ""
            if text.strip():
                entry = f'"{text}"' if not text.startswith('"') else text
                if speaker:
                    entry += f" — {speaker}"
                result.append(entry)
    return result


def _cluster_to_item(c: Cluster) -> ClusterItem:
    return ClusterItem(
        id=str(c.id),
        digest_date=c.digest_date.isoformat(),
        title=c.title,
        headline=c.headline,
        summary=c.summary,
        bullets=c.bullets if isinstance(c.bullets, list) else [],
        quotes=_normalize_quotes(c.quotes),
        topic_tags=c.topic_tags or [],
        content_style=c.content_style,
        information_density=c.information_density,
        content_attributes=c.content_attributes,
        unpacked_sections=[UnpackSection(**s) for s in c.unpacked_sections] if c.unpacked_sections else None,
        source_count=c.source_count,
        is_merged=c.is_merged,
        status=c.status,
        sources=[
            SourceItem(
                article_id=str(s.article_id),
                source_url=s.source_url,
                source_name=s.source_name,
                content_type=s.content_type,
                extraction_quality=s.article.extraction_quality if s.article else "ok",
                image_url=s.image_url,
            )
            for s in c.sources
        ],
    )


@router.get("/api/digests", response_model=DigestResponse)
async def get_digests(
    before_date: str | None = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Get digest clusters, most recent first. Cursor-paginated by date."""
    query = (
        select(Cluster)
        .options(selectinload(Cluster.sources).selectinload(ClusterSource.article))
        .order_by(Cluster.digest_date.desc(), Cluster.is_merged.desc(), Cluster.created_at.desc())
        .limit(limit + 1)  # fetch one extra to detect has_more
    )

    if before_date:
        query = query.where(Cluster.digest_date < date.fromisoformat(before_date))

    result = await db.execute(query)
    clusters = list(result.scalars().all())

    has_more = len(clusters) > limit
    if has_more:
        clusters = clusters[:limit]

    return DigestResponse(
        has_more=has_more,
        clusters=[_cluster_to_item(c) for c in clusters],
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


@router.post("/api/digests/{cluster_id}/unpack", response_model=UnpackResponse)
async def unpack_cluster(cluster_id: str, db: AsyncSession = Depends(get_db)):
    """Generate a structured section breakdown of a cluster's source content."""
    result = await db.execute(
        select(Cluster)
        .options(selectinload(Cluster.sources).selectinload(ClusterSource.article))
        .where(Cluster.id == cluster_id)
    )
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # Cache hit
    if cluster.unpacked_sections is not None:
        return UnpackResponse(ok=True, sections=[UnpackSection(**s) for s in cluster.unpacked_sections])

    # Paywall gate — all sources must be paywalled to block
    non_paywalled = [s for s in cluster.sources if s.article and s.article.extraction_quality != "low"]
    if not non_paywalled:
        raise HTTPException(status_code=422, detail="Cannot unpack — all sources are behind a paywall")

    # Gather source text
    source_count = len(non_paywalled)
    per_article_budget = max(3000, 12000 // source_count)
    parts = []
    for s in non_paywalled:
        text = s.article.clean_text or ""
        title = s.article.title or s.source_name or "Untitled"
        parts.append(f"## {title}\n\n{text[:per_article_budget]}")
    combined_text = "\n\n---\n\n".join(parts)

    # Refresh focused topics cache (may be stale for on-demand calls)
    await refresh_focused_topics()

    # LLM call
    sections = await unpack_sections(combined_text, cluster.headline)

    # Cache write
    cluster.unpacked_sections = sections
    await db.commit()

    return UnpackResponse(ok=True, sections=[UnpackSection(**s) for s in sections])


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
