"""
Task Router — Single dispatch point for all AI calls.

This is the ONLY file that knows about model names, providers, or routing rules.
All other code calls these functions; never LiteLLM/OpenAI directly.
"""

import asyncio
import json
import logging

import httpx
import litellm

from app.core.config import settings
from app.core.usage_tracker import record_usage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Focused topics cache — refreshed at each pipeline run
# ---------------------------------------------------------------------------

_focused_topics_cache: list[str] = []


async def refresh_focused_topics():
    """Reload focused topics from DB into memory. Call at pipeline start."""
    global _focused_topics_cache
    from app.core.database import async_session
    from app.models.database import UserSetting
    from sqlalchemy import select

    async with async_session() as db:
        result = await db.execute(
            select(UserSetting).where(UserSetting.key == "focused_topics")
        )
        row = result.scalar_one_or_none()
        _focused_topics_cache = row.value if row else []
    logger.info(f"Focused topics cache: {_focused_topics_cache}")


def _get_focused_topics_prompt() -> str:
    if not _focused_topics_cache:
        return ""
    return ", ".join(_focused_topics_cache)

# Suppress litellm's verbose logging
litellm.suppress_debug_info = True


# ---------------------------------------------------------------------------
# LLM mode tracking — consumers read this to know local vs cloud
# ---------------------------------------------------------------------------

class LLMTracker:
    """Tracks which LLM provider (local/cloud) is active across all AI calls."""

    def __init__(self):
        self.current_mode: str | None = None  # "local" | "cloud" | None
        self.is_active: bool = False  # True while an AI call is in flight
        self._call_count: int = 0

    def record(self, is_local: bool):
        mode = "local" if is_local else "cloud"
        # Cloud always trumps local — once cloud is used, it stays cloud
        if mode == "cloud" or self.current_mode is None:
            self.current_mode = mode

    def start_call(self):
        self._call_count += 1
        self.is_active = True

    def end_call(self):
        self._call_count = max(0, self._call_count - 1)
        if self._call_count == 0:
            self.is_active = False

    def reset(self):
        self.current_mode = None

    def to_dict(self):
        # When active, predict mode from env config if no cloud call recorded yet
        effective_mode = self.current_mode
        if self.is_active and effective_mode != "cloud":
            # If either tier is set to cloud, we'll hit cloud eventually
            if settings.llm_mode_heavy == "cloud" or settings.llm_mode_light == "cloud":
                effective_mode = "cloud"
        return {
            "llm_mode": effective_mode,
            "is_active": self.is_active,
        }


llm_tracker = LLMTracker()


def _track(fn):
    """Decorator that marks an AI call as active in llm_tracker."""
    async def wrapper(*args, **kwargs):
        llm_tracker.start_call()
        try:
            return await fn(*args, **kwargs)
        finally:
            llm_tracker.end_call()
    wrapper.__name__ = fn.__name__
    return wrapper


# ---------------------------------------------------------------------------
# Routing helpers
# ---------------------------------------------------------------------------

async def _ollama_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            return resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        return False


async def _should_use_local(tier: str) -> bool:
    """Raises RuntimeError if mode=local but Ollama is unreachable."""
    mode = settings.llm_mode_light if tier == "light" else settings.llm_mode_heavy

    if mode == "cloud":
        return False
    if mode == "local":
        available = await _ollama_available()
        if not available:
            raise RuntimeError(f"LLM_MODE_{tier.upper()}=local but Ollama is not reachable")
        return True
    # auto: try local first
    return await _ollama_available()


def _get_chat_model(tier: str = "heavy") -> str:
    if tier == "heavy":
        return f"ollama/{settings.local_chat_heavy}"
    return f"ollama/{settings.local_chat_light}"


def _get_cloud_chat_models() -> list[str]:
    models = [settings.cloud_chat_model]
    if settings.cloud_chat_fallback:
        models.append(settings.cloud_chat_fallback)
    if settings.cloud_chat_fallback_2:
        models.append(settings.cloud_chat_fallback_2)
    return models


def _get_cloud_chat_model() -> str:
    return settings.cloud_chat_model


async def _cloud_completion(task_name: str, **kwargs) -> object:
    """Try cloud chat models in fallback order until one succeeds."""
    models = _get_cloud_chat_models()
    last_error = None
    for model in models:
        try:
            logger.info("%s: trying cloud model %s", task_name, model)
            response = await litellm.acompletion(model=model, **kwargs)
            llm_tracker.record(is_local=False)
            record_usage(response, task_name, model, is_local=False)
            return response
        except Exception as e:
            logger.warning("%s: cloud model %s failed (%s)", task_name, model, e)
            last_error = e
    raise last_error


def _get_embed_model(local: bool = True) -> str:
    if local:
        return f"ollama/{settings.local_embed_model}"
    return settings.cloud_embed_model


# ---------------------------------------------------------------------------
# AI functions
# ---------------------------------------------------------------------------

@_track
async def embed(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of texts into 768-dimensional vectors.

    Uses local Ollama nomic-embed-text by default, falls back to
    OpenAI text-embedding-3-small (dimensions=768) when unavailable.
    """
    use_local = await _should_use_local("light")

    if use_local:
        model = _get_embed_model(local=True)
        logger.info(f"embed: using local model {model} for {len(texts)} texts")
        try:
            response = await litellm.aembedding(
                model=model,
                input=texts,
                api_base=settings.ollama_base_url,
            )
            llm_tracker.record(is_local=True)
            record_usage(response, "embed", model, is_local=True)
            return [item["embedding"] for item in response.data]
        except Exception as e:
            logger.warning(f"embed: local model failed ({e}), falling back to cloud")
            # Only fall back if mode is auto
            if settings.llm_mode_light == "local":
                raise

    logger.info(f"embed: using cloud model {settings.cloud_embed_model} for {len(texts)} texts")
    response = await litellm.aembedding(
        model=settings.cloud_embed_model,
        input=texts,
        dimensions=settings.embed_dimensions,
    )
    llm_tracker.record(is_local=False)
    record_usage(response, "embed", settings.cloud_embed_model, is_local=False)
    return [item["embedding"] for item in response.data]


@_track
async def summarize(text: str, content_type: str = "article") -> dict:
    """
    Generate a multi-level summary of content.

    Returns: {headline, summary, bullets: list[str], quotes: list[str]}
    """
    use_local = await _should_use_local("heavy")

    system_prompt = """You are an insightful content analyst. You surface what is novel, surprising, or contrarian — not what is commonly known. Output valid JSON only."""

    topics_hint = _get_focused_topics_prompt()
    topics_section = (
        f"\n\nThe reader is particularly interested in: {topics_hint}.\n"
        "When the content relates to these topics, provide more detailed bullets and highlight relevant quotes."
        if topics_hint else ""
    )

    user_prompt = f"""Analyze the following {content_type} and produce a structured JSON object with these fields:

- "headline": A single compelling sentence (max 15 words)
- "summary": A 2-3 sentence summary emphasizing what is new, surprising, or non-obvious. Skip widely-known background context.
- "bullets": An array of 3-5 key takeaway bullet points (strings). Prioritize novel insights, counterintuitive findings, and actionable information over commonly understood facts.
- "quotes": An array of 1-3 notable direct quotes from the text (strings). Prefer controversial, provocative, or uniquely insightful quotes. Include the speaker's name if identifiable. Return empty array if no noteworthy quotes exist.
- "content_style": Classify the content as ONE of: "tutorial", "demo", "opinion", "interview", "news", "analysis", "narrative", "review". Use "tutorial" for step-by-step teaching, "demo" for hands-on demonstrations or walkthroughs, "opinion" for editorials or hot takes, "interview" for Q&A or conversation format, "news" for factual reporting, "analysis" for deep dives with original research or data, "narrative" for storytelling, "review" for product/tool reviews.
- "information_density": Rate 1-10 how much substantive, actionable, or novel information is packed into this content. 1 = mostly filler/repetition/common knowledge. 10 = extremely dense with unique data, examples, or demonstrations. Content with code samples, data, step-by-step instructions, or visual demonstrations should score higher.

Respond ONLY with the JSON object, no markdown formatting.{topics_section}

Text:
{text[:8000]}"""

    if use_local:
        model = _get_chat_model("heavy")
        logger.info(f"summarize: using local model {model}")
        try:
            response = await litellm.acompletion(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                api_base=settings.ollama_base_url,
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            llm_tracker.record(is_local=True)
            record_usage(response, "summarize", model, is_local=True)
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.warning(f"summarize: local model failed ({e}), falling back to cloud")
            if settings.llm_mode_heavy == "local":
                raise

    response = await _cloud_completion(
        "summarize",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


@_track
async def unpack_sections(text: str, headline: str, is_video: bool = False) -> list[dict]:
    """
    Break down content into 3-5 key sections with mini-summaries.

    Returns: [{"title": "Section heading", "content": "2-3 sentence summary"}, ...]
    When is_video=True, sections may include a "timestamp" field (e.g. "3:45").
    """
    use_local = await _should_use_local("heavy")

    system_prompt = "You are an expert content analyst. You break down content into its key sections, surfacing the structure and substance the reader needs to decide whether to engage with the full piece."

    topics_hint = _get_focused_topics_prompt()
    topics_section = (
        f"\n\nThe reader is particularly interested in: {topics_hint}.\n"
        "Emphasize sections that relate to these topics."
        if topics_hint else ""
    )

    timestamp_instruction = ""
    if is_video:
        timestamp_instruction = """
If the text contains [MM:SS] timestamp markers, include a "timestamp" field in each section with the marker closest to where that section's content begins (e.g., "timestamp": "3:45"). If no timestamps are present, omit the field."""

    response_example = '{"sections": [{"title": "...", "content": "..."}, ...]}'
    if is_video:
        response_example = '{"sections": [{"title": "...", "content": "...", "timestamp": "3:45"}, ...]}'

    user_prompt = f"""Break down this content into 3-5 key sections. For each section, provide a short heading and a 2-3 sentence summary of what that section covers.
Focus on substance — skip introductions, filler, and promotional content.{topics_section}{timestamp_instruction}

The existing summary headline is: {headline}

Respond with a JSON object: {response_example}

Text:
{text[:12000]}"""

    if use_local:
        model = _get_chat_model("heavy")
        logger.info(f"unpack_sections: using local model {model}")
        try:
            response = await asyncio.wait_for(
                litellm.acompletion(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    api_base=settings.ollama_base_url,
                    temperature=0.3,
                    response_format={"type": "json_object"},
                    num_ctx=16384,
                ),
                timeout=45,
            )
            llm_tracker.record(is_local=True)
            record_usage(response, "unpack", model, is_local=True)
            result = json.loads(response.choices[0].message.content)
            return result.get("sections", result) if isinstance(result, dict) else result
        except Exception as e:
            logger.warning(f"unpack_sections: local model failed ({e}), falling back to cloud")
            if settings.llm_mode_heavy == "local":
                raise

    response = await _cloud_completion(
        "unpack",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    result = json.loads(response.choices[0].message.content)
    return result.get("sections", result) if isinstance(result, dict) else result


@_track
async def score_quality(summary_text: str) -> int:
    """Score summary quality 1-10. Uses chat-light tier."""
    use_local = await _should_use_local("light")

    prompt = f"""Rate the quality of this summary on a scale of 1-10.
Consider: accuracy, completeness, clarity, and conciseness.
Respond with ONLY a single integer.

Summary:
{summary_text}"""

    try:
        if use_local:
            model = _get_chat_model("light")
            response = await litellm.acompletion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                api_base=settings.ollama_base_url,
            )
            llm_tracker.record(is_local=True)
            record_usage(response, "score_quality", model, is_local=True)
        else:
            response = await _cloud_completion(
                "score_quality",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
            )
        score_str = response.choices[0].message.content.strip()
        return max(1, min(10, int(score_str)))
    except (ValueError, Exception) as e:
        logger.warning(f"score_quality: failed ({e}), defaulting to 7")
        return 7


@_track
async def tag_topics(text: str) -> list[str]:
    """Auto-tag content with 1-3 topic labels. Uses chat-light tier."""
    use_local = await _should_use_local("light")

    topics_hint = _get_focused_topics_prompt()
    also_consider = (
        f"\nAlso consider these user-specific topics: {topics_hint}"
        if topics_hint else ""
    )

    prompt = f"""Assign 1-3 topic tags to this content. Choose from common categories like:
AI & ML, Cloud, DevOps, Security, Business, Programming, Data, Science, Design, Career{also_consider}

Respond with ONLY a JSON array of strings, e.g. ["AI & ML", "Cloud"]

Text:
{text[:3000]}"""

    try:
        if use_local:
            model = _get_chat_model("light")
            response = await litellm.acompletion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                api_base=settings.ollama_base_url,
            )
            llm_tracker.record(is_local=True)
            record_usage(response, "tag_topics", model, is_local=True)
        else:
            response = await _cloud_completion(
                "tag_topics",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
        content = response.choices[0].message.content.strip()
        # Handle potential markdown wrapping
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(content)
    except Exception as e:
        logger.warning(f"tag_topics: failed ({e}), defaulting to ['General']")
        return ["General"]


@_track
async def summarize_sub_items(items: list[dict]) -> list[dict]:
    """Generate one-line summaries for roundup sub-items in a single batched LLM call.

    Items that already have a body >= 20 words are summarized to a single line.
    Items with short bodies are returned with body as summary.
    Uses chat-light tier to keep costs low.
    """
    # Separate items needing LLM summarization vs. already short enough
    needs_summary = []
    result = []
    for i, item in enumerate(items):
        body = item.get("body", "")
        if len(body.split()) <= 25:
            # Short enough to use as-is
            result.append({**item, "summary": body})
        else:
            needs_summary.append((i, item))
            result.append(item)  # placeholder, will be updated

    if not needs_summary:
        return result

    # Build batched prompt
    lines = []
    for idx, (_, item) in enumerate(needs_summary):
        lines.append(f"{idx + 1}. {item.get('title', 'Untitled')}: {item.get('body', '')[:300]}")

    prompt = f"""Summarize each of the following {len(needs_summary)} items in ONE sentence each (max 30 words per summary).
Respond with a JSON array of strings, where each string is the summary for the corresponding item.

Items:
{chr(10).join(lines)}"""

    use_local = await _should_use_local("light")
    try:
        if use_local:
            model = _get_chat_model("light")
            response = await litellm.acompletion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                response_format={"type": "json_object"},
                api_base=settings.ollama_base_url,
            )
            llm_tracker.record(is_local=True)
            record_usage(response, "summarize_sub_items", model, is_local=True)
        else:
            response = await _cloud_completion(
                "summarize_sub_items",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                response_format={"type": "json_object"},
            )

        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        parsed = json.loads(content)

        # Handle both {"summaries": [...]} and direct [...] format
        summaries = parsed if isinstance(parsed, list) else parsed.get("summaries", parsed.get("items", []))

        for idx, (orig_idx, item) in enumerate(needs_summary):
            summary = summaries[idx] if idx < len(summaries) else item.get("body", "")[:100]
            result[orig_idx] = {**item, "summary": summary}

    except Exception as e:
        logger.warning(f"summarize_sub_items: failed ({e}), using truncated bodies")
        for orig_idx, item in needs_summary:
            result[orig_idx] = {**item, "summary": item.get("body", "")[:100]}

    return result


def _trim_history(history: list[dict], budget: int = 4000) -> list[dict]:
    """Select recent conversation exchanges that fit within a character budget.

    Walks backward through history, including whole Q&A pairs until the budget
    is exceeded. Always includes at least the most recent exchange.
    """
    if not history:
        return []
    trimmed: list[dict] = []
    used = 0
    for entry in reversed(history):
        entry_len = len(entry.get("question", "")) + len(entry.get("answer", ""))
        if trimmed and used + entry_len > budget:
            break
        trimmed.append(entry)
        used += entry_len
    trimmed.reverse()
    return trimmed


@_track
async def rag_answer(
    question: str,
    context_chunks: list[str],
    history: list[dict] | None = None,
) -> dict:
    """
    Generate a RAG answer with citations.

    Args:
        history: Optional list of {"question": str, "answer": str} from the client.

    Returns: {answer: str, related_questions: list[str]}
    """
    use_local = await _should_use_local("heavy")

    context = "\n\n---\n\n".join(
        [f"[Source {i+1}]: {chunk}" for i, chunk in enumerate(context_chunks)]
    )

    topics_hint = _get_focused_topics_prompt()
    topics_section = (
        f"\nThe user is particularly interested in: {topics_hint}.\n"
        "Lean your answer toward these topics when relevant."
        if topics_hint else ""
    )

    trimmed = _trim_history(history or [])
    history_section = ""
    if trimmed:
        lines = []
        for entry in trimmed:
            lines.append(f"User: {entry['question']}")
            lines.append(f"Assistant: {entry['answer']}")
        history_section = (
            "\n\nConversation so far:\n" + "\n".join(lines) + "\n"
        )

    system_prompt = f"""You are a helpful knowledge assistant. Answer questions using ONLY the provided sources.
Cite sources using [1], [2], etc. inline. If the sources don't contain relevant information, say so.
Output valid JSON only.{topics_section}"""

    user_prompt = f"""Sources:
{context}
{history_section}
Question: {question}

Respond with a JSON object:
{{
  "answer": "Your answer with [1][2] citations inline",
  "related_questions": ["2-3 follow-up questions the user might ask"]
}}"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    if use_local:
        model = _get_chat_model("heavy")
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            temperature=0.3,
            response_format={"type": "json_object"},
            api_base=settings.ollama_base_url,
        )
        llm_tracker.record(is_local=True)
        record_usage(response, "rag_answer", model, is_local=True)
    else:
        response = await _cloud_completion(
            "rag_answer",
            messages=messages,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
    return json.loads(response.choices[0].message.content)
