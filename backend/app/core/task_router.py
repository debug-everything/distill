"""
Task Router — Single dispatch point for all AI calls.

This is the ONLY file that knows about model names, providers, or routing rules.
All other code calls these functions; never LiteLLM/OpenAI directly.
"""

import logging

import httpx
import litellm

from app.core.config import settings

logger = logging.getLogger(__name__)

# Suppress litellm's verbose logging
litellm.suppress_debug_info = True


async def _ollama_available() -> bool:
    """Check if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            return resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        return False


def _get_chat_model(tier: str = "heavy") -> str:
    """Get the model name for the given tier, formatted for LiteLLM."""
    if tier == "heavy":
        return f"ollama/{settings.local_chat_heavy}"
    return f"ollama/{settings.local_chat_light}"


def _get_cloud_chat_model() -> str:
    return settings.cloud_chat_model


def _get_embed_model(local: bool = True) -> str:
    if local:
        return f"ollama/{settings.local_embed_model}"
    return settings.cloud_embed_model


async def embed(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of texts into 768-dimensional vectors.

    Uses local Ollama nomic-embed-text by default, falls back to
    OpenAI text-embedding-3-small (dimensions=768) when unavailable.
    """
    use_local = await _ollama_available()

    if use_local:
        model = _get_embed_model(local=True)
        logger.info(f"embed: using local model {model} for {len(texts)} texts")
        try:
            response = await litellm.aembedding(
                model=model,
                input=texts,
                api_base=settings.ollama_base_url,
            )
            return [item["embedding"] for item in response.data]
        except Exception as e:
            logger.warning(f"embed: local model failed ({e}), falling back to cloud")
            use_local = False

    if not use_local:
        model = _get_cloud_chat_model()
        logger.info(f"embed: using cloud model {settings.cloud_embed_model} for {len(texts)} texts")
        response = await litellm.aembedding(
            model=settings.cloud_embed_model,
            input=texts,
            dimensions=settings.embed_dimensions,
        )
        return [item["embedding"] for item in response.data]


async def summarize(text: str, content_type: str = "article") -> dict:
    """
    Generate a multi-level summary of content.

    Returns: {headline, summary, bullets: list[str], quotes: list[str]}
    """
    use_local = await _ollama_available()

    system_prompt = "You are a concise news summarizer. Output valid JSON only."
    user_prompt = f"""Summarize the following {content_type} into a structured JSON object with these fields:
- "headline": A single compelling sentence (max 15 words)
- "summary": A 2-3 sentence summary
- "bullets": An array of 3-5 key takeaway bullet points (strings)
- "quotes": An array of 1-3 notable direct quotes from the text (strings), or empty array if none

Respond ONLY with the JSON object, no markdown formatting.

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
            import json

            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.warning(f"summarize: local model failed ({e}), falling back to cloud")

    model = _get_cloud_chat_model()
    logger.info(f"summarize: using cloud model {model}")
    response = await litellm.acompletion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    import json

    return json.loads(response.choices[0].message.content)


async def score_quality(summary_text: str) -> int:
    """
    Score the quality of a summary on a scale of 1-10.

    Uses chat-light tier (fast, cheap).
    """
    use_local = await _ollama_available()

    prompt = f"""Rate the quality of this summary on a scale of 1-10.
Consider: accuracy, completeness, clarity, and conciseness.
Respond with ONLY a single integer.

Summary:
{summary_text}"""

    model = _get_chat_model("light") if use_local else _get_cloud_chat_model()
    kwargs = {}
    if use_local:
        kwargs["api_base"] = settings.ollama_base_url

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            **kwargs,
        )
        score_str = response.choices[0].message.content.strip()
        return max(1, min(10, int(score_str)))
    except (ValueError, Exception) as e:
        logger.warning(f"score_quality: failed ({e}), defaulting to 7")
        return 7


async def tag_topics(text: str) -> list[str]:
    """
    Auto-tag content with 1-3 topic labels.

    Uses chat-light tier.
    """
    use_local = await _ollama_available()

    prompt = f"""Assign 1-3 topic tags to this content. Choose from common categories like:
AI & ML, Cloud, DevOps, Security, Business, Programming, Data, Science, Design, Career

Respond with ONLY a JSON array of strings, e.g. ["AI & ML", "Cloud"]

Text:
{text[:3000]}"""

    model = _get_chat_model("light") if use_local else _get_cloud_chat_model()
    kwargs = {}
    if use_local:
        kwargs["api_base"] = settings.ollama_base_url

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            **kwargs,
        )
        import json

        content = response.choices[0].message.content.strip()
        # Handle potential markdown wrapping
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(content)
    except Exception as e:
        logger.warning(f"tag_topics: failed ({e}), defaulting to ['General']")
        return ["General"]


async def rag_answer(question: str, context_chunks: list[str]) -> dict:
    """
    Generate a RAG answer with citations.

    Returns: {answer: str, related_questions: list[str]}
    """
    use_local = await _ollama_available()

    context = "\n\n---\n\n".join(
        [f"[Source {i+1}]: {chunk}" for i, chunk in enumerate(context_chunks)]
    )

    system_prompt = """You are a helpful knowledge assistant. Answer questions using ONLY the provided sources.
Cite sources using [1], [2], etc. inline. If the sources don't contain relevant information, say so.
Output valid JSON only."""

    user_prompt = f"""Sources:
{context}

Question: {question}

Respond with a JSON object:
{{
  "answer": "Your answer with [1][2] citations inline",
  "related_questions": ["2-3 follow-up questions the user might ask"]
}}"""

    model = _get_chat_model("heavy") if use_local else _get_cloud_chat_model()
    kwargs = {}
    if use_local:
        kwargs["api_base"] = settings.ollama_base_url

    response = await litellm.acompletion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
        **kwargs,
    )
    import json

    return json.loads(response.choices[0].message.content)
