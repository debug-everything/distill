"""Feed service — orchestrates fetch across all source types."""

import asyncio
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import delete, select, update, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.log_utils import sanitize
from app.core.task_router import tag_topics, refresh_focused_topics, llm_tracker, summarize_sub_items
from app.models.database import FeedItem, FeedSource, UserSetting
from app.services.roundup_splitter import detect_multi_story, split_roundup

logger = logging.getLogger(__name__)

# Max items to keep per source. Oldest non-captured items are purged after each fetch.
# Set to 0 to disable retention (keep everything).
FEED_RETENTION_PER_SOURCE = int(os.environ.get("FEED_RETENTION_PER_SOURCE", "100"))

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
            logger.error("Background feed fetch failed: %s", e)
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

            # Auto-detect multi-story sources on first fetch
            if new_items and source.last_fetched is None:
                await _auto_detect_multi_story(source, new_items)

            # Process multi-story roundup items
            is_multi = (source.config or {}).get("is_multi_story", False)
            if is_multi and new_items:
                status.stage = f"Splitting roundups: {source.name}"
                await _process_roundup_items(new_items)

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

            # Purge old items beyond retention limit
            await _purge_old_items(db, source)

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


async def _purge_old_items(db: AsyncSession, source: FeedSource):
    """Delete oldest non-captured items beyond the retention limit for a source."""
    if FEED_RETENTION_PER_SOURCE <= 0:
        return

    # Find the published_at cutoff: the Nth most recent item
    # We keep captured items regardless (they're linked to digest/KB)
    count_result = await db.execute(
        select(sa_func.count(FeedItem.id)).where(
            FeedItem.feed_source_id == source.id,
            FeedItem.status != "captured",
        )
    )
    total = count_result.scalar() or 0
    if total <= FEED_RETENTION_PER_SOURCE:
        return

    # Get IDs of items to keep (most recent N by published_at, then created_at)
    keep_subq = (
        select(FeedItem.id)
        .where(
            FeedItem.feed_source_id == source.id,
            FeedItem.status != "captured",
        )
        .order_by(
            FeedItem.published_at.desc().nullslast(),
            FeedItem.created_at.desc(),
        )
        .limit(FEED_RETENTION_PER_SOURCE)
    )
    keep_ids = (await db.execute(keep_subq)).scalars().all()

    if not keep_ids:
        return

    # Delete everything else that's not captured
    purge_result = await db.execute(
        delete(FeedItem).where(
            FeedItem.feed_source_id == source.id,
            FeedItem.status != "captured",
            FeedItem.id.notin_(keep_ids),
        )
    )
    purged = purge_result.rowcount
    if purged > 0:
        logger.info("Purged %d old items from %s (retention: %d)", purged, sanitize(source.name), FEED_RETENTION_PER_SOURCE)


async def _auto_detect_multi_story(source: FeedSource, items: list[FeedItem]):
    """On first fetch, check if this source produces roundup-style content and flag it."""
    raw_htmls = [getattr(item, "_raw_html", None) or "" for item in items]
    if detect_multi_story(raw_htmls, feed_title=source.name):
        config = dict(source.config or {})
        config["is_multi_story"] = True
        source.config = config
        logger.info("Auto-detected multi-story source: %s", sanitize(source.name))


async def _process_roundup_items(items: list[FeedItem]):
    """Split roundup items into sub-items and generate summaries."""
    for item in items:
        raw_html = getattr(item, "_raw_html", None)
        if not raw_html:
            continue

        sub_items = split_roundup(raw_html)
        if not sub_items:
            continue

        try:
            sub_items = await summarize_sub_items(sub_items)
        except Exception as e:
            logger.warning("Sub-item summarization failed for %s: %s", sanitize(item.title or ""), e)

        item.sub_items = sub_items
        logger.debug("Split %s into %d sub-items", sanitize(item.title or ""), len(sub_items))


async def _get_focused_topics(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(UserSetting).where(UserSetting.key == "focused_topics")
    )
    setting = result.scalar_one_or_none()
    if setting and isinstance(setting.value, dict):
        return setting.value.get("topics", [])
    return []
