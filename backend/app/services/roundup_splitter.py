"""Roundup splitter — detect and split multi-story RSS entries into sub-items."""

import logging
import re
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Known roundup feed title keywords
_ROUNDUP_KEYWORDS = re.compile(
    r"\b(tldr|digest|roundup|newsletter|weekly|daily|morning brew|the batch|import ai)\b",
    re.IGNORECASE,
)

# Max sub-items to extract per entry
MAX_SUB_ITEMS = 15


def detect_multi_story(entries_html: list[str], feed_title: str = "") -> bool:
    """Check if a batch of RSS entries look like roundup/aggregated content.

    Examines the raw HTML of the first few entries for structural signals.
    Returns True if the source appears to be a multi-story feed.
    """
    # Quick check: known roundup keywords in feed title
    if _ROUNDUP_KEYWORDS.search(feed_title):
        return True

    if not entries_html:
        return False

    roundup_count = 0
    for html in entries_html[:5]:
        if _entry_looks_like_roundup(html):
            roundup_count += 1

    # If 2+ of the first 5 entries look like roundups, flag it
    return roundup_count >= 2


def _entry_looks_like_roundup(html: str) -> bool:
    """Heuristic: does a single entry's HTML look like a multi-story roundup?"""
    if not html or len(html) < 200:
        return False

    # Count structural separators
    heading_count = len(re.findall(r"<h[23][^>]*>", html, re.IGNORECASE))
    hr_count = len(re.findall(r"<hr\s*/?>", html, re.IGNORECASE))
    separators = heading_count + hr_count

    # Count external links
    links = re.findall(r'href=["\']https?://([^"\']+)', html)
    unique_domains = len({urlparse(f"https://{l}").netloc for l in links})

    # A roundup typically has 3+ section breaks and 5+ distinct external domains
    if separators >= 3 and unique_domains >= 5:
        return True

    # Numbered list patterns (e.g., "1.", "2.", "3." at line starts)
    numbered = len(re.findall(r"(?:^|\n)\s*\d+[\.\)]\s", html))
    if numbered >= 5:
        return True

    return False


def split_roundup(html: str) -> list[dict]:
    """Split roundup HTML into sub-items.

    Returns list of {"title": str, "body": str, "url": str|None, "category": str|None}.
    The "body" field contains the raw text for each sub-item (may need LLM summarization
    if too long, or can be used as-is if short enough).
    """
    if not html:
        return []

    # Try splitting by headings first, then by HR tags, then by numbered items
    items = _split_by_headings(html)
    if len(items) < 3:
        items = _split_by_separators(html)
    if len(items) < 3:
        items = _split_by_numbered(html)
    if len(items) < 2:
        return []

    return items[:MAX_SUB_ITEMS]


def _split_by_headings(html: str) -> list[dict]:
    """Split HTML on <h2>/<h3> tags."""
    # Split on h2/h3 tags, keeping the heading text
    parts = re.split(r"<h[23][^>]*>(.*?)</h[23]>", html, flags=re.IGNORECASE | re.DOTALL)

    items = []
    current_category = None

    # parts alternates: [pre-heading, heading-text, content, heading-text, content, ...]
    i = 1  # skip content before first heading
    while i < len(parts) - 1:
        heading = _strip_tags(parts[i]).strip()
        content_html = parts[i + 1] if i + 1 < len(parts) else ""
        i += 2

        if not heading:
            continue

        content_text = _strip_tags(content_html).strip()
        word_count = len(content_text.split())

        # Very short content under a heading might be a category header
        if word_count < 10 and not _extract_first_link(content_html):
            current_category = heading
            continue

        url = _extract_first_link(content_html)

        items.append({
            "title": heading[:200],
            "body": content_text[:500],
            "url": url,
            "category": current_category,
        })

    return items


def _split_by_separators(html: str) -> list[dict]:
    """Split HTML on <hr> tags or --- text separators."""
    sections = re.split(r"<hr\s*/?>|(?:\n\s*---\s*\n)", html, flags=re.IGNORECASE)

    items = []
    for section in sections:
        section = section.strip()
        if not section:
            continue

        text = _strip_tags(section).strip()
        if len(text.split()) < 10:
            continue

        # Try to extract a title from bold/strong text or first line
        title = _extract_title_from_section(section, text)
        url = _extract_first_link(section)

        items.append({
            "title": title[:200],
            "body": text[:500],
            "url": url,
            "category": None,
        })

    return items


def _split_by_numbered(html: str) -> list[dict]:
    """Split content by numbered list patterns (1. 2. 3. etc.)."""
    text = _strip_tags(html)
    # Split on numbered items at line boundaries
    parts = re.split(r"\n\s*(\d+)[\.\)]\s+", text)

    items = []
    i = 1  # skip text before first number
    while i < len(parts) - 1:
        # parts[i] = number, parts[i+1] = content until next number
        content = parts[i + 1].strip()
        i += 2

        if len(content.split()) < 5:
            continue

        # First sentence or line as title
        lines = content.split("\n")
        title = lines[0].strip()
        body = content

        items.append({
            "title": title[:200],
            "body": body[:500],
            "url": None,
            "category": None,
        })

    return items


def _extract_title_from_section(html: str, text: str) -> str:
    """Try to extract a title from bold/strong/anchor text, or use first line."""
    # Try <strong> or <b> text
    match = re.search(r"<(?:strong|b)>(.*?)</(?:strong|b)>", html, re.IGNORECASE | re.DOTALL)
    if match:
        title = _strip_tags(match.group(1)).strip()
        if 5 < len(title) < 200:
            return title

    # Try linked text (first <a> with substantial text)
    match = re.search(r"<a[^>]*>(.*?)</a>", html, re.IGNORECASE | re.DOTALL)
    if match:
        title = _strip_tags(match.group(1)).strip()
        if 5 < len(title) < 200:
            return title

    # Fall back to first line of text
    first_line = text.split("\n")[0].strip()
    if len(first_line) > 200:
        first_line = first_line[:197] + "..."
    return first_line or "Untitled"


def _extract_first_link(html: str) -> str | None:
    """Extract the first external HTTP link from HTML."""
    match = re.search(r'href=["\']?(https?://[^\s"\'<>]+)', html, re.IGNORECASE)
    if match:
        url = match.group(1).rstrip(")")
        # Skip common non-article links
        skip_domains = {"twitter.com", "x.com", "facebook.com", "linkedin.com", "mailto:"}
        parsed = urlparse(url)
        if not any(d in parsed.netloc for d in skip_domains):
            return url
    return None


def _strip_tags(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text
