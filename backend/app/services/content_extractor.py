"""Content extraction — factory that dispatches to the right extractor by URL type."""

import re
from dataclasses import dataclass

from app.core.security import validate_url


@dataclass
class ExtractionResult:
    title: str
    clean_text: str
    raw_html: str
    source_domain: str
    content_type: str  # "article" | "video"
    extraction_quality: str  # "ok" | "low" | "auto-transcript"
    image_url: str | None = None
    content_attributes: dict | None = None  # e.g. {"has_demo_cues": True, "description": "..."}


_YOUTUBE_PATTERNS = [
    re.compile(r"(?:https?://)?(?:www\.)?youtube\.com/watch\?v=[\w-]+"),
    re.compile(r"(?:https?://)?youtu\.be/[\w-]+"),
    re.compile(r"(?:https?://)?(?:www\.)?youtube\.com/shorts/[\w-]+"),
]


def is_youtube_url(url: str) -> bool:
    return any(p.match(url) for p in _YOUTUBE_PATTERNS)


async def extract_content(url: str) -> ExtractionResult:
    """Detect URL type and dispatch to the appropriate extractor."""
    validate_url(url)
    if is_youtube_url(url):
        from app.services.video_extractor import extract_video
        return await extract_video(url)
    else:
        from app.services.article_extractor import extract_article
        return await extract_article(url)
