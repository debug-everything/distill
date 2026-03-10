"""Article content extraction via httpx + readability-lxml."""

import logging
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from readability import Document

logger = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


@dataclass
class ExtractionResult:
    title: str
    clean_text: str
    raw_html: str
    source_domain: str
    extraction_quality: str  # "ok" | "low"


async def extract_article(url: str) -> ExtractionResult:
    """Fetch URL and extract clean text using readability-lxml."""
    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": _USER_AGENT},
    ) as client:
        response = await client.get(url)
        response.raise_for_status()

    raw_html = response.text
    doc = Document(raw_html)
    title = doc.title() or ""
    # Get text content, strip HTML tags
    summary_html = doc.summary()
    clean_text = _html_to_text(summary_html)
    source_domain = urlparse(url).netloc

    # Paywall detection: very short content likely means paywall
    word_count = len(clean_text.split())
    extraction_quality = "low" if word_count < 200 else "ok"

    if extraction_quality == "low":
        logger.warning(f"Low extraction quality for {url} ({word_count} words)")

    return ExtractionResult(
        title=title,
        clean_text=clean_text,
        raw_html=raw_html,
        source_domain=source_domain,
        extraction_quality=extraction_quality,
    )


def _html_to_text(html: str) -> str:
    """Strip HTML tags to get plain text."""
    import re

    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text
