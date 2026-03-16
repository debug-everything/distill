"""LLM usage tracking — buffer calls in memory, flush to DB periodically."""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import litellm

from app.models.database import LLMUsage

logger = logging.getLogger(__name__)


@dataclass
class UsageRecord:
    task_type: str
    model: str
    provider: str  # "local" | "cloud"
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# In-memory buffer
_buffer: list[UsageRecord] = []
_flush_task: asyncio.Task | None = None

FLUSH_INTERVAL_SECONDS = 60


def record_usage(response, task_type: str, model: str, is_local: bool):
    """Extract usage from a LiteLLM response and buffer it."""
    input_tokens = 0
    output_tokens = 0
    cost = 0.0

    if hasattr(response, "usage") and response.usage:
        input_tokens = getattr(response.usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(response.usage, "completion_tokens", 0) or 0

    if not is_local:
        try:
            cost = litellm.completion_cost(completion_response=response)
        except Exception:
            cost = 0.0

    _buffer.append(UsageRecord(
        task_type=task_type,
        model=model,
        provider="local" if is_local else "cloud",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost,
    ))


async def flush_to_db():
    """Bulk insert buffered records to DB and clear buffer."""
    if not _buffer:
        return

    from app.core.database import async_session

    records = list(_buffer)
    _buffer.clear()

    try:
        async with async_session() as db:
            for r in records:
                db.add(LLMUsage(
                    task_type=r.task_type,
                    model=r.model,
                    provider=r.provider,
                    input_tokens=r.input_tokens,
                    output_tokens=r.output_tokens,
                    cost_usd=r.cost_usd,
                    created_at=r.created_at,
                ))
            await db.commit()
        logger.debug(f"Flushed {len(records)} usage records to DB")
    except Exception as e:
        logger.error(f"Failed to flush usage records: {e}")
        # Put records back so they aren't lost
        _buffer.extend(records)


async def _flush_loop():
    """Background loop that flushes every FLUSH_INTERVAL_SECONDS."""
    while True:
        await asyncio.sleep(FLUSH_INTERVAL_SECONDS)
        await flush_to_db()


def start_flush_loop():
    """Start the background flush task."""
    global _flush_task
    if _flush_task is None:
        _flush_task = asyncio.get_event_loop().create_task(_flush_loop())
        logger.info("Usage tracker flush loop started")


async def final_flush():
    """Flush remaining records on shutdown."""
    global _flush_task
    if _flush_task:
        _flush_task.cancel()
        _flush_task = None
    await flush_to_db()
