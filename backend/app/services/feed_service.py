"""Feed service — orchestrates fetch across all source types."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select, update, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.log_utils import sanitize
from app.core.task_router import tag_topics, refresh_focused_topics, llm_tracker
from app.models.database import FeedItem, FeedSource, UserSetting

logger = logging.getLogger(__name__)

_fetch_lock = asyncio.Lock()


class FeedFetchStatus:
    def __init__(self):
        self.is_processing = False
        self.total = 0
        self.current = 0
        self.stage = ""
        self.llm_mode: str | None = None
        self.last_result: dict | None = None
        self.source_progress: list[dict] = []  # per-source progress for frontend

    def to_dict(self):
        return {
            "is_processing": self.is_processing,
            "total": self.total,
            "current": self.current,
            "stage": self.stage,
            "llm_mode": llm_tracker.current_mode if self.is_processing else self.llm_mode,
            "last_result": self.last_result,
            "source_progress": self.source_progress,
        }


status = FeedFetchStatus()


def start_fetch_in_background() -> dict:
    """Kick off feed fetch as a background task. Returns immediately."""
    if _fetch_lock.locked():
        return {"ok": False, "detail": "Feed fetch already in progress"}

    asyncio.get_event_loop().create_task(_background_fetch())
    return {"ok": True, "detail": "Fetch started"}


async def _background_fetch():
    from app.core.database import async_session

    async with _fetch_lock:
        status.is_processing = True
        status.source_progress = []
        llm_tracker.reset()
        try:
            async with async_session() as db:
                result = await _run_fetch(db)
                status.last_result = result
        except Exception as e:
            logger.error(f"Background feed fetch failed: {e}")
            status.last_result = {"ok": False, "detail": str(e)}
        finally:
            status.is_processing = False
            status.stage = ""
            status.llm_mode = llm_tracker.current_mode


async def _run_fetch(db: AsyncSession) -> dict:
    """Fetch all active sources, tag topics, compute match scores."""
    await refresh_focused_topics()

    # Load focused topics for match scoring
    focused = await _get_focused_topics(db)

    # Get active sources
    result = await db.execute(
        select(FeedSource).where(FeedSource.is_active == True).order_by(FeedSource.created_at)
    )
    sources = list(result.scalars().all())

    if not sources:
        return {"ok": True, "sources_scanned": 0, "new_items": 0, "topic_matches": 0}

    status.total = len(sources)
    total_new = 0
    total_matches = 0

    for i, source in enumerate(sources):
        status.current = i + 1
        status.stage = f"Fetching {source.name} ({i + 1}/{len(sources)})"

        source_result = {"name": source.name, "source_type": source.source_type, "new_items": 0, "status": "pending"}
        status.source_progress.append(source_result)

        try:
            new_items = await _fetch_source(db, source)
            source_result["new_items"] = len(new_items)
            source_result["status"] = "done"

            # Tag topics and compute match scores for new items
            for item in new_items:
                status.stage = f"Tagging: {item.title[:50]}"
                try:
                    text = f"{item.title} {item.content or ''}"[:2000]
                    tags = await tag_topics(text)
                    item.topic_tags = tags
                    item.topic_match_score = len(set(tags) & set(focused)) if focused else 0
                    if item.topic_match_score > 0:
                        total_matches += 1
                except Exception as e:
                    logger.error("Tagging failed for feed item %s: %s", sanitize(item.title or ""), e)
                    item.topic_tags = []
                    item.topic_match_score = 0

            # Update source metadata
            source.last_fetched = datetime.now(timezone.utc)
            count_result = await db.execute(
                select(sa_func.count(FeedItem.id)).where(FeedItem.feed_source_id == source.id)
            )
            source.item_count = count_result.scalar() or 0

            total_new += len(new_items)
            await db.commit()

        except Exception as e:
            logger.error("Fetch failed for source %s: %s", sanitize(source.name), e)
            source_result["status"] = "error"
            source_result["error"] = str(e)
            await db.rollback()

    return {
        "ok": True,
        "sources_scanned": len(sources),
        "new_items": total_new,
        "topic_matches": total_matches,
    }


async def _fetch_source(db: AsyncSession, source: FeedSource) -> list[FeedItem]:
    """Dispatch to the appropriate fetcher based on source type."""
    if source.source_type in ("rss", "youtube"):
        from app.services.rss_fetcher import fetch_rss_source
        return await fetch_rss_source(db, source)
    elif source.source_type == "newsletter":
        # Newsletter fetching will be implemented in Phase 11F
        logger.info("Newsletter fetch not yet implemented for %s", sanitize(source.name))
        return []
    else:
        logger.warning("Unknown source type: %s", sanitize(source.source_type))
        return []


async def _get_focused_topics(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(UserSetting).where(UserSetting.key == "focused_topics")
    )
    setting = result.scalar_one_or_none()
    if setting and isinstance(setting.value, dict):
        return setting.value.get("topics", [])
    return []
