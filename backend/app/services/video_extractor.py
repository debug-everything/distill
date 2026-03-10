"""YouTube video extraction via youtube-transcript-api."""

import logging
from urllib.parse import parse_qs, urlparse

from youtube_transcript_api import YouTubeTranscriptApi

from app.services.content_extractor import ExtractionResult

logger = logging.getLogger(__name__)

_yt_api = YouTubeTranscriptApi()


def _extract_video_id(url: str) -> str | None:
    """Extract the video ID from various YouTube URL formats."""
    parsed = urlparse(url)

    # youtube.com/watch?v=ID
    if parsed.hostname in ("www.youtube.com", "youtube.com"):
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [None])[0]
        # youtube.com/shorts/ID
        if parsed.path.startswith("/shorts/"):
            return parsed.path.split("/")[2]

    # youtu.be/ID
    if parsed.hostname == "youtu.be":
        return parsed.path.lstrip("/")

    return None


async def extract_video(url: str) -> ExtractionResult:
    """Extract transcript and metadata from a YouTube video."""
    video_id = _extract_video_id(url)
    if not video_id:
        raise ValueError(f"Could not extract video ID from URL: {url}")

    # Try manual transcript first, then auto-generated
    is_auto_generated = False
    try:
        transcript_list = _yt_api.list(video_id)

        try:
            transcript = transcript_list.find_manually_created_transcript(["en"])
        except Exception:
            try:
                transcript = transcript_list.find_generated_transcript(["en"])
                is_auto_generated = True
            except Exception:
                raise ValueError(f"No English transcript available for video {video_id}")

        segments = transcript.fetch()
        clean_text = " ".join(seg.text for seg in segments)
    except ValueError:
        raise
    except Exception:
        # Fallback: use the simple .fetch() which auto-selects best transcript
        try:
            segments = _yt_api.fetch(video_id)
            clean_text = " ".join(seg.text for seg in segments)
            is_auto_generated = True  # assume auto if we can't determine
        except Exception as e:
            raise ValueError(f"Could not fetch transcript for video {video_id}: {e}")

    # Title via oembed (lightweight, no API key)
    title = await _fetch_title(url)

    # Thumbnail: predictable YouTube URL pattern
    image_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

    # Quality assessment
    word_count = len(clean_text.split())
    if word_count < 100:
        extraction_quality = "low"
    elif is_auto_generated:
        extraction_quality = "auto-transcript"
    else:
        extraction_quality = "ok"

    if extraction_quality != "ok":
        logger.warning(
            f"Video {video_id}: quality={extraction_quality}, "
            f"auto_gen={is_auto_generated}, words={word_count}"
        )

    return ExtractionResult(
        title=title or f"YouTube Video ({video_id})",
        clean_text=clean_text,
        raw_html="",
        source_domain="youtube.com",
        content_type="video",
        extraction_quality=extraction_quality,
        image_url=image_url,
    )


async def _fetch_title(url: str) -> str | None:
    """Fetch video title via YouTube oembed (no API key needed)."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
            )
            if resp.status_code == 200:
                return resp.json().get("title")
    except Exception:
        pass
    return None
