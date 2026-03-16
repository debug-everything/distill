"""Feed API — sources CRUD, fetch trigger, feed items list, capture to digest/KB."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.log_utils import sanitize
from app.models.database import FeedItem, FeedSource
from app.services.feed_service import start_fetch_in_background, status as fetch_status

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class FeedSourceCreate(BaseModel):
    source_type: str  # rss | youtube | newsletter
    name: str
    url: str | None = None
    config: dict | None = None


class FeedSourceOut(BaseModel):
    id: str
    source_type: str
    name: str
    url: str | None
    config: dict | None
    last_fetched: str | None
    item_count: int
    is_active: bool
    created_at: str


class FeedItemOut(BaseModel):
    id: str
    feed_source_id: str
    source_type: str
    guid: str | None
    title: str
    content: str | None
    url: str | None
    source_domain: str | None
    image_url: str | None
    published_at: str | None
    summary: str | None
    bullets: list | None
    content_style: str | None
    information_density: int | None
    topic_tags: list[str]
    topic_match_score: int
    source_name: str | None
    status: str
    created_at: str


class FeedListResponse(BaseModel):
    items: list[FeedItemOut]
    has_more: bool


class FeedItemPatch(BaseModel):
    status: str


class CaptureFromFeedRequest(BaseModel):
    mode: str = "consume_later"  # consume_later | learn_now


class FeedSummarizeResponse(BaseModel):
    ok: bool
    summary: str
    bullets: list[str]
    content_style: str | None = None
    information_density: int | None = None
    cached: bool = False


class SourceDetectRequest(BaseModel):
    url: str


class SourceDetectResponse(BaseModel):
    source_type: str
    name: str
    feed_url: str
    original_url: str


# ---------------------------------------------------------------------------
# Source CRUD
# ---------------------------------------------------------------------------

def _source_to_out(s: FeedSource) -> FeedSourceOut:
    return FeedSourceOut(
        id=str(s.id),
        source_type=s.source_type,
        name=s.name,
        url=s.url,
        config=s.config,
        last_fetched=s.last_fetched.isoformat() if s.last_fetched else None,
        item_count=s.item_count,
        is_active=s.is_active,
        created_at=s.created_at.isoformat(),
    )


@router.get("/api/feed/sources")
async def list_sources(db: AsyncSession = Depends(get_db)) -> list[FeedSourceOut]:
    """List all configured feed sources."""
    result = await db.execute(select(FeedSource).order_by(FeedSource.created_at.desc()))
    return [_source_to_out(s) for s in result.scalars().all()]


@router.post("/api/feed/sources", status_code=201)
async def create_source(req: FeedSourceCreate, db: AsyncSession = Depends(get_db)) -> FeedSourceOut:
    """Add a new feed source."""
    if req.source_type not in ("rss", "youtube", "newsletter"):
        raise HTTPException(status_code=400, detail="source_type must be rss, youtube, or newsletter")

    source = FeedSource(
        source_type=req.source_type,
        name=req.name,
        url=req.url,
        config=req.config,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _source_to_out(source)


@router.delete("/api/feed/sources/{source_id}")
async def delete_source(source_id: str, db: AsyncSession = Depends(get_db)):
    """Remove a feed source and all its items (cascade)."""
    result = await db.execute(select(FeedSource).where(FeedSource.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    await db.delete(source)
    await db.commit()
    return {"ok": True}


@router.post("/api/feed/sources/detect")
async def detect_source(req: SourceDetectRequest) -> SourceDetectResponse:
    """Auto-detect feed source type and resolve RSS URL from a user-provided URL.

    Handles YouTube channels (all URL formats), direct RSS/Atom feeds,
    and blogs/sites with RSS auto-discovery.
    """
    from app.services.source_detector import detect_source as _detect

    try:
        result = await _detect(req.url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("Source detection failed for %s: %s", sanitize(req.url), e)
        raise HTTPException(status_code=422, detail=f"Could not detect feed source: {e}")

    return SourceDetectResponse(
        source_type=result.source_type,
        name=result.name,
        feed_url=result.feed_url,
        original_url=result.original_url,
    )


# ---------------------------------------------------------------------------
# Fetch trigger + status
# ---------------------------------------------------------------------------

@router.post("/api/feed/fetch")
async def trigger_fetch():
    """Trigger fetch for all active sources. Runs in background."""
    return start_fetch_in_background()


@router.get("/api/feed/fetch-status")
async def get_fetch_status():
    """Get current feed fetch processing status."""
    return fetch_status.to_dict()


# ---------------------------------------------------------------------------
# Feed items
# ---------------------------------------------------------------------------

def _item_to_out(i: FeedItem) -> FeedItemOut:
    return FeedItemOut(
        id=str(i.id),
        feed_source_id=str(i.feed_source_id),
        source_type=i.source_type,
        guid=i.guid,
        title=i.title,
        content=i.content,
        url=i.url,
        source_domain=i.source_domain,
        image_url=i.image_url,
        published_at=i.published_at.isoformat() if i.published_at else None,
        summary=i.summary,
        bullets=i.bullets,
        content_style=i.content_style,
        information_density=i.information_density,
        topic_tags=i.topic_tags or [],
        topic_match_score=i.topic_match_score,
        source_name=i.source_name,
        status=i.status,
        created_at=i.created_at.isoformat(),
    )


@router.get("/api/feed", response_model=FeedListResponse)
async def list_feed_items(
    status: str | None = None,
    source_type: str | None = None,
    before_date: str | None = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """Get feed items, paginated, sorted by topic_match_score desc then published_at desc."""
    query = select(FeedItem)

    if status:
        query = query.where(FeedItem.status == status)
    if source_type:
        query = query.where(FeedItem.source_type == source_type)
    if before_date:
        from datetime import date
        query = query.where(FeedItem.created_at < date.fromisoformat(before_date))

    query = query.order_by(
        FeedItem.topic_match_score.desc(),
        FeedItem.published_at.desc().nullslast(),
    ).limit(limit + 1)

    result = await db.execute(query)
    items = list(result.scalars().all())

    has_more = len(items) > limit
    if has_more:
        items = items[:limit]

    return FeedListResponse(
        items=[_item_to_out(i) for i in items],
        has_more=has_more,
    )


@router.patch("/api/feed/{item_id}")
async def update_feed_item(item_id: str, req: FeedItemPatch, db: AsyncSession = Depends(get_db)):
    """Update feed item status."""
    if req.status not in ("unread", "read", "archived"):
        raise HTTPException(status_code=400, detail="status must be unread, read, or archived")

    result = await db.execute(select(FeedItem).where(FeedItem.id == item_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Feed item not found")

    await db.execute(
        update(FeedItem).where(FeedItem.id == item_id).values(status=req.status)
    )
    await db.commit()
    return {"ok": True}


def _friendly_extraction_error(raw: str) -> str:
    """Convert verbose extraction errors into concise user-facing messages."""
    lowered = raw.lower()
    if "live event" in lowered or "premieres in" in lowered:
        return "This video hasn't aired yet — no content to summarize"
    if "transcript" in lowered and ("disabled" in lowered or "not available" in lowered):
        return "No transcript available for this video"
    if "could not retrieve a transcript" in lowered:
        return "Video transcript is unavailable (may be private, age-restricted, or have no captions)"
    if "403" in raw or "forbidden" in lowered:
        return "Access denied — content may be behind a login or paywall"
    if "404" in raw or "not found" in lowered:
        return "Page not found — the URL may have been removed"
    if "timeout" in lowered or "timed out" in lowered:
        return "Request timed out — try again later"
    # Fallback: truncate to something reasonable
    short = raw.split("\n")[0][:120]
    return f"Could not extract content: {short}"


@router.post("/api/feed/{item_id}/summarize", response_model=FeedSummarizeResponse)
async def summarize_feed_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """On-demand summarization for a feed item.

    Fetches the item's URL, extracts content, runs summarize(), and caches
    the result on the feed item for future instant retrieval.
    """
    result = await db.execute(select(FeedItem).where(FeedItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Feed item not found")

    # Cache hit — return immediately
    if item.summary is not None:
        return FeedSummarizeResponse(
            ok=True,
            summary=item.summary,
            bullets=item.bullets or [],
            content_style=item.content_style,
            information_density=item.information_density,
            cached=True,
        )

    if not item.url:
        raise HTTPException(status_code=422, detail="Feed item has no URL to summarize")

    # Extract content from the URL
    from app.services.content_extractor import extract_content

    try:
        extraction = await extract_content(item.url)
    except Exception as e:
        logger.error("Extraction failed for feed item %s (%s): %s", item_id, sanitize(item.url), e)
        raise HTTPException(status_code=422, detail=_friendly_extraction_error(str(e)))

    if not extraction.clean_text or len(extraction.clean_text.strip()) < 100:
        raise HTTPException(
            status_code=422,
            detail="Content is too short to summarize",
        )

    # Summarize via task_router
    from app.core.task_router import summarize

    try:
        summary_result = await summarize(
            extraction.clean_text, content_type=extraction.content_type
        )
    except Exception as e:
        logger.error(f"Summarize failed for feed item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Summarization failed: {e}")

    # Cache on the feed item
    summary_text = summary_result.get("summary", "")
    bullets = summary_result.get("bullets", [])
    content_style = summary_result.get("content_style")
    information_density = summary_result.get("information_density")

    await db.execute(
        update(FeedItem)
        .where(FeedItem.id == item_id)
        .values(
            summary=summary_text,
            bullets=bullets,
            content_style=content_style,
            information_density=information_density,
        )
    )
    await db.commit()

    return FeedSummarizeResponse(
        ok=True,
        summary=summary_text,
        bullets=bullets if isinstance(bullets, list) else [],
        content_style=content_style,
        information_density=information_density,
    )


@router.post("/api/feed/{item_id}/capture")
async def capture_feed_item(
    item_id: str,
    req: CaptureFromFeedRequest,
    db: AsyncSession = Depends(get_db),
):
    """Capture a feed item into the digest queue or knowledge base.

    Delegates to the existing article capture pipeline.
    """
    if req.mode not in ("consume_later", "learn_now"):
        raise HTTPException(status_code=400, detail="mode must be consume_later or learn_now")

    result = await db.execute(select(FeedItem).where(FeedItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Feed item not found")

    if not item.url:
        raise HTTPException(status_code=422, detail="Feed item has no URL to capture")

    # Delegate to existing capture logic
    from app.api.capture import CaptureRequest, capture_url
    capture_req = CaptureRequest(url=item.url, mode=req.mode)

    # Use a fresh DB session for the capture (it does its own commit)
    from app.core.database import async_session
    async with async_session() as capture_db:
        capture_response = await capture_url(capture_req, capture_db)

    # Mark feed item as captured
    await db.execute(
        update(FeedItem).where(FeedItem.id == item_id).values(status="captured")
    )
    await db.commit()

    # Schedule deferred digest processing for consume_later captures
    if req.mode == "consume_later":
        from app.services.digest_processor import schedule_deferred_processing
        schedule_deferred_processing()

    return {"ok": True, "capture_result": capture_response}
