"""RSS/Atom feed fetcher — shared by YouTube channel and blog/site sources."""

import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.log_utils import sanitize
from app.models.database import FeedItem, FeedSource

logger = logging.getLogger(__name__)

# Cap per source per scan to avoid flooding
MAX_ITEMS_PER_SOURCE = 25


async def fetch_rss_source(db: AsyncSession, source: FeedSource) -> list[FeedItem]:
    """Fetch RSS/Atom feed for a source, dedup, and return new FeedItems (already added to session)."""
    import feedparser

    if not source.url:
        logger.warning("Source %s has no URL", sanitize(source.name))
        return []

    feed = feedparser.parse(source.url)
    if feed.bozo and not feed.entries:
        logger.error("Feed parse error for %s: %s", sanitize(source.name), feed.bozo_exception)
        return []

    entries = feed.entries[:MAX_ITEMS_PER_SOURCE]
    if not entries:
        return []

    # Load existing guids for this source to dedup in bulk
    existing_guids_result = await db.execute(
        select(FeedItem.guid).where(
            FeedItem.feed_source_id == source.id,
            FeedItem.guid.isnot(None),
        )
    )
    existing_guids = {row[0] for row in existing_guids_result.all()}

    new_items: list[FeedItem] = []
    for entry in entries:
        guid = entry.get("id") or entry.get("link") or entry.get("title")
        if not guid:
            continue
        if guid in existing_guids:
            continue

        title = entry.get("title", "Untitled")
        link = entry.get("link")
        content = _extract_entry_content(entry)
        published = _parse_published(entry)

        # Skip future-dated entries (scheduled/upcoming broadcasts)
        if published and published > datetime.now(timezone.utc):
            logger.debug("Skipping future-dated entry: %s (%s)", title, published.isoformat())
            continue

        domain = urlparse(link).netloc if link else None
        image_url = _extract_thumbnail(entry, source)

        item = FeedItem(
            feed_source_id=source.id,
            source_type=source.source_type,
            guid=guid,
            title=title,
            content=content,
            url=link,
            source_domain=domain,
            image_url=image_url,
            published_at=published,
            source_name=source.name,
            status="unread",
        )
        db.add(item)
        new_items.append(item)

    if new_items:
        await db.flush()
        logger.info("Fetched %d new items from %s", len(new_items), sanitize(source.name))

    return new_items


def _extract_entry_content(entry) -> str | None:
    """Get the best available text content from a feed entry, stripped of HTML."""
    raw = None
    if "content" in entry and entry["content"]:
        raw = entry["content"][0].get("value", "")
    else:
        raw = entry.get("summary") or entry.get("description")
    if not raw:
        return None
    return _strip_html(raw)


def _strip_html(html: str) -> str:
    import re
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _parse_published(entry):
    from datetime import datetime, timezone
    import time

    published_parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if published_parsed:
        try:
            return datetime(*published_parsed[:6], tzinfo=timezone.utc)
        except (TypeError, ValueError):
            pass

    return None


def _extract_thumbnail(entry, source: FeedSource) -> str | None:
    # YouTube videos have predictable thumbnails
    if source.source_type == "youtube":
        video_id = _extract_youtube_video_id(entry)
        if video_id:
            return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

    # RSS media:thumbnail
    if "media_thumbnail" in entry and entry["media_thumbnail"]:
        return entry["media_thumbnail"][0].get("url")

    # Enclosure
    for enc in entry.get("enclosures", []):
        if enc.get("type", "").startswith("image/"):
            return enc.get("href")

    return None


def _extract_youtube_video_id(entry) -> str | None:
    # YouTube RSS entries have yt:videoId tag
    video_id = entry.get("yt_videoid")
    if video_id:
        return video_id

    # Fallback: extract from link
    link = entry.get("link", "")
    if "youtube.com/watch" in link:
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(link)
        return parse_qs(parsed.query).get("v", [None])[0]

    return None
