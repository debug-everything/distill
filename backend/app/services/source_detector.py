"""Source auto-detection — resolves user-provided URLs into feed source configs.

Handles:
- YouTube channel URLs (all formats) → RSS feed URL
- Direct RSS/Atom feed URLs → validated feed
- Blog/site URLs → RSS auto-discovery via <link rel="alternate">
"""

import logging
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com"}
_YOUTUBE_RSS_BASE = "https://www.youtube.com/feeds/videos.xml?channel_id="

# Channel ID format: UC + 22 alphanumeric/dash/underscore chars
_CHANNEL_ID_RE = re.compile(r"UC[\w-]{22}")


@dataclass
class DetectedSource:
    source_type: str  # rss | youtube
    name: str
    feed_url: str
    original_url: str


async def detect_source(url: str) -> DetectedSource:
    """Detect what kind of feed source a URL represents and resolve it.

    Raises ValueError with a user-friendly message on failure.
    """
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)
    host = parsed.netloc.lower().removeprefix("www.")

    # YouTube channel detection
    if host in ("youtube.com", "m.youtube.com"):
        return await _detect_youtube(url, parsed)

    # Try as direct RSS/Atom feed first, then HTML auto-discovery
    return await _detect_rss(url)


# ---------------------------------------------------------------------------
# YouTube
# ---------------------------------------------------------------------------

async def _detect_youtube(url: str, parsed) -> DetectedSource:
    """Resolve a YouTube channel URL to its RSS feed."""
    path = parsed.path.rstrip("/")

    # /channel/UCxxx — channel ID is right there
    match = re.match(r"/channel/(UC[\w-]{22})", path)
    if match:
        channel_id = match.group(1)
        name = await _fetch_youtube_channel_name(channel_id)
        return DetectedSource(
            source_type="youtube",
            name=name,
            feed_url=_YOUTUBE_RSS_BASE + channel_id,
            original_url=url,
        )

    # /@handle, /c/name, /user/name — need to scrape the page for channel ID
    if re.match(r"/(@[\w.-]+|[cC]/|user/)", path):
        channel_id = await _resolve_youtube_channel_id(url)
        name = await _fetch_youtube_channel_name(channel_id)
        return DetectedSource(
            source_type="youtube",
            name=name,
            feed_url=_YOUTUBE_RSS_BASE + channel_id,
            original_url=url,
        )

    raise ValueError(
        "Unrecognized YouTube URL format. Use a channel URL like "
        "youtube.com/@handle or youtube.com/channel/UCxxx"
    )


async def _resolve_youtube_channel_id(url: str) -> str:
    """Fetch a YouTube channel page and extract the channel ID from HTML."""
    async with httpx.AsyncClient(
        timeout=10.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; Distill/1.0)"},
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    html = resp.text

    # Strategy 1: canonical link — most reliable
    # <link rel="canonical" href="https://www.youtube.com/channel/UCxxx">
    match = re.search(
        r'<link\s+rel="canonical"\s+href="https?://www\.youtube\.com/channel/(UC[\w-]{22})"',
        html,
    )
    if match:
        return match.group(1)

    # Strategy 2: og:url meta tag
    match = re.search(
        r'<meta\s+property="og:url"\s+content="https?://www\.youtube\.com/channel/(UC[\w-]{22})"',
        html,
    )
    if match:
        return match.group(1)

    # Strategy 3: browse_id or channel_id in page data
    match = re.search(r'"browseId"\s*:\s*"(UC[\w-]{22})"', html)
    if match:
        return match.group(1)

    # Strategy 4: any channel ID pattern in the page
    match = _CHANNEL_ID_RE.search(html)
    if match:
        return match.group(0)

    raise ValueError("Could not find channel ID on the YouTube page. Try using the /channel/UCxxx URL format.")


async def _fetch_youtube_channel_name(channel_id: str) -> str:
    """Fetch the channel name from the RSS feed title."""
    import feedparser

    feed_url = _YOUTUBE_RSS_BASE + channel_id
    feed = feedparser.parse(feed_url)
    if feed.feed.get("title"):
        return feed.feed["title"]
    return f"YouTube ({channel_id})"


# ---------------------------------------------------------------------------
# RSS / Blog auto-discovery
# ---------------------------------------------------------------------------

async def _detect_rss(url: str) -> DetectedSource:
    """Try URL as direct feed, then try HTML auto-discovery."""
    import feedparser

    async with httpx.AsyncClient(
        timeout=10.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; Distill/1.0)"},
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    content_type = resp.headers.get("content-type", "")

    # Check if the URL itself is an RSS/Atom feed
    if _looks_like_feed(content_type, resp.text):
        feed = feedparser.parse(resp.text)
        name = feed.feed.get("title") or urlparse(url).netloc
        return DetectedSource(
            source_type="rss",
            name=name,
            feed_url=url,
            original_url=url,
        )

    # HTML page — look for <link rel="alternate" type="application/rss+xml">
    feed_url = _find_feed_link(resp.text, url)
    if feed_url:
        feed = feedparser.parse(feed_url)
        if not feed.bozo or feed.entries:
            name = feed.feed.get("title") or urlparse(url).netloc
            return DetectedSource(
                source_type="rss",
                name=name,
                feed_url=feed_url,
                original_url=url,
            )

    raise ValueError(
        "No RSS/Atom feed found at this URL. "
        "Try providing a direct feed URL or a site that has an RSS feed."
    )


def _looks_like_feed(content_type: str, body: str) -> bool:
    """Heuristic: does this response look like an RSS/Atom feed?"""
    feed_types = ("application/rss", "application/atom", "application/xml", "text/xml")
    if any(t in content_type for t in feed_types):
        return True
    # Check first 500 chars for RSS/Atom markers
    head = body[:500]
    return "<rss" in head or "<feed" in head or "<channel>" in head


def _find_feed_link(html: str, base_url: str) -> str | None:
    """Extract RSS/Atom feed URL from HTML <link> tags."""
    from urllib.parse import urljoin

    # Match <link rel="alternate" type="application/rss+xml" href="...">
    # or <link rel="alternate" type="application/atom+xml" href="...">
    pattern = re.compile(
        r'<link\s[^>]*?rel=["\']alternate["\'][^>]*?href=["\']([^"\']+)["\'][^>]*?type=["\']application/(rss|atom)\+xml["\']'
        r'|'
        r'<link\s[^>]*?type=["\']application/(rss|atom)\+xml["\'][^>]*?href=["\']([^"\']+)["\']',
        re.IGNORECASE,
    )
    match = pattern.search(html)
    if match:
        href = match.group(1) or match.group(4)
        if href:
            return urljoin(base_url, href)
    return None
