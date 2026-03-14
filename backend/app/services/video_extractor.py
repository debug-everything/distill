"""YouTube video extraction via youtube-transcript-api."""

import logging
import re
from urllib.parse import parse_qs, urlparse

from youtube_transcript_api import YouTubeTranscriptApi

from app.services.content_extractor import ExtractionResult

logger = logging.getLogger(__name__)

_yt_api = YouTubeTranscriptApi()

# Transcript phrases that suggest screen demos, code walkthroughs, visual content
_DEMO_CUE_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"\bas you can see\b",
        r"\blet me show\b",
        r"\bI('|')?ll show\b",
        r"\bon (?:the |my )?screen\b",
        r"\bhere (?:we|I|you) (?:can see|have)\b",
        r"\blet('|')?s (?:look at|take a look|go (?:ahead|through))\b",
        r"\bswitch(?:ing)? (?:to|over)\b",
        r"\bopen(?:ing)? up\b",
        r"\btype (?:in|this)\b",
        r"\brun (?:this|the)\b",
        r"\bclick(?:ing)? on\b",
        r"\bdrag(?:ging)?\b.*\bdrop\b",
        r"\bcode editor\b",
        r"\bterminal\b",
        r"\bbrowser\b",
        r"\bVS ?Code\b",
        r"\bcommand line\b",
        r"\bscreenshot\b",
    ]
]

# Description keywords that hint at tutorial/demo content
_DESCRIPTION_DEMO_KEYWORDS = [
    "tutorial", "walkthrough", "step by step", "step-by-step", "how to",
    "demo", "demonstration", "hands-on", "follow along", "code along",
    "build", "create", "implement", "timestamps", "chapters",
]


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


def _detect_demo_cues(transcript_text: str) -> dict:
    """Detect visual/demo cues in transcript text using pattern matching.

    Returns dict with cue count and matched patterns for transparency.
    """
    matches = []
    for pattern in _DEMO_CUE_PATTERNS:
        found = pattern.findall(transcript_text)
        if found:
            matches.append({"pattern": pattern.pattern, "count": len(found)})

    total_cues = sum(m["count"] for m in matches)
    word_count = len(transcript_text.split())
    # Normalize: cues per 1000 words
    cue_density = round(total_cues / max(word_count, 1) * 1000, 1)

    return {
        "has_demo_cues": total_cues >= 3,
        "demo_cue_count": total_cues,
        "demo_cue_density": cue_density,  # per 1000 words
    }


def _analyze_description(description: str | None) -> dict:
    """Analyze video description for content style signals."""
    if not description:
        return {"has_description": False}

    desc_lower = description.lower()
    matched_keywords = [kw for kw in _DESCRIPTION_DEMO_KEYWORDS if kw in desc_lower]

    # Check for timestamps (common in tutorial/structured content)
    timestamp_pattern = re.compile(r"\d{1,2}:\d{2}")
    timestamp_count = len(timestamp_pattern.findall(description))

    return {
        "has_description": True,
        "description_demo_keywords": matched_keywords,
        "has_timestamps": timestamp_count >= 3,
        "timestamp_count": timestamp_count,
    }


async def extract_video(url: str) -> ExtractionResult:
    """Extract transcript and metadata from a YouTube video."""
    video_id = _extract_video_id(url)
    if not video_id:
        raise ValueError(f"Could not extract video ID from URL: {url}")

    # Try manual transcript first, then auto-generated
    is_auto_generated = False
    timestamped_segments: list[dict] = []
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
        timestamped_segments = [
            {"start": round(seg.start, 1), "text": seg.text}
            for seg in segments
        ]
    except ValueError:
        raise
    except Exception:
        # Fallback: use the simple .fetch() which auto-selects best transcript
        try:
            segments = _yt_api.fetch(video_id)
            clean_text = " ".join(seg.text for seg in segments)
            timestamped_segments = [
                {"start": round(seg.start, 1), "text": seg.text}
                for seg in segments
            ]
            is_auto_generated = True  # assume auto if we can't determine
        except Exception as e:
            raise ValueError(f"Could not fetch transcript for video {video_id}: {e}")

    # Title + description via oembed (lightweight, no API key)
    title, description = await _fetch_metadata(url)

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

    # Content attributes: demo detection + description analysis
    demo_cues = _detect_demo_cues(clean_text)
    desc_analysis = _analyze_description(description)
    content_attributes = {
        **demo_cues,
        **desc_analysis,
        "timestamped_segments": timestamped_segments,
    }

    logger.info(
        f"Video {video_id}: demo_cues={demo_cues['demo_cue_count']}, "
        f"density={demo_cues['demo_cue_density']}/1k words, "
        f"desc_keywords={desc_analysis.get('description_demo_keywords', [])}"
    )

    return ExtractionResult(
        title=title or f"YouTube Video ({video_id})",
        clean_text=clean_text,
        raw_html="",
        source_domain="youtube.com",
        content_type="video",
        extraction_quality=extraction_quality,
        image_url=image_url,
        content_attributes=content_attributes,
    )


async def _fetch_metadata(url: str) -> tuple[str | None, str | None]:
    """Fetch video title and description via YouTube oembed + page scrape."""
    import httpx

    title = None
    description = None

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # oembed gives us the title
            resp = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
            )
            if resp.status_code == 200:
                title = resp.json().get("title")

            # Scrape description from og:description meta tag (no API key needed)
            page_resp = await client.get(url)
            if page_resp.status_code == 200:
                desc_match = re.search(
                    r'<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]*)"',
                    page_resp.text,
                    re.IGNORECASE,
                )
                if desc_match:
                    description = desc_match.group(1)
    except Exception as e:
        logger.warning(f"Failed to fetch video metadata: {e}")

    return title, description
