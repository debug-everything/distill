"""Article content extraction via httpx + readability-lxml."""

import logging
import re
from urllib.parse import urlparse

import httpx
from readability import Document

from app.core.log_utils import sanitize
from app.core.security import validate_url
from app.services.content_extractor import ExtractionResult

logger = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


async def extract_article(url: str) -> ExtractionResult:
    """Fetch URL and extract clean text using readability-lxml."""
    safe_url = validate_url(url)
    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": _USER_AGENT},
    ) as client:
        response = await client.get(safe_url)
        response.raise_for_status()

    raw_html = response.text
    doc = Document(raw_html)
    title = doc.title() or ""
    summary_html = doc.summary()
    clean_text = _html_to_text(summary_html)
    source_domain = urlparse(url).netloc
    image_url = _extract_og_image(raw_html)

    word_count = len(clean_text.split())
    extraction_quality = "low" if word_count < 200 else "ok"

    if extraction_quality == "low":
        logger.warning("Low extraction quality for %s (%d words)", sanitize(url), word_count)

    return ExtractionResult(
        title=title,
        clean_text=clean_text,
        raw_html=raw_html,
        source_domain=source_domain,
        content_type="article",
        extraction_quality=extraction_quality,
        image_url=image_url,
    )


def _extract_og_image(html: str) -> str | None:
    """Extract og:image or twitter:image from HTML meta tags."""
    for pattern in [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
    ]:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def _html_to_text(html: str) -> str:
    """Strip HTML tags to get plain text."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text
