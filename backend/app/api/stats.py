"""LLM usage stats endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.usage_tracker import flush_to_db
from app.models.database import LLMUsage

router = APIRouter()


@router.get("/api/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Return aggregated LLM usage stats."""
    # Flush any buffered records first so stats are current
    await flush_to_db()

    # Totals
    totals_result = await db.execute(
        select(
            func.count(1).label("total_calls"),
            func.coalesce(func.sum(LLMUsage.input_tokens), 0).label("total_input_tokens"),
            func.coalesce(func.sum(LLMUsage.output_tokens), 0).label("total_output_tokens"),
            func.coalesce(func.sum(LLMUsage.cost_usd), 0.0).label("total_cost_usd"),
            func.count(1).filter(LLMUsage.provider == "local").label("local_calls"),
            func.count(1).filter(LLMUsage.provider == "cloud").label("cloud_calls"),
        ).select_from(LLMUsage)
    )
    t = totals_result.one()

    # By task type
    by_task_result = await db.execute(
        select(
            LLMUsage.task_type,
            func.count(1).label("calls"),
            func.sum(LLMUsage.input_tokens).label("input_tokens"),
            func.sum(LLMUsage.output_tokens).label("output_tokens"),
            func.sum(LLMUsage.cost_usd).label("cost_usd"),
        )
        .group_by(LLMUsage.task_type)
        .order_by(func.sum(LLMUsage.cost_usd).desc())
    )

    # Daily (last 30 days)
    daily_result = await db.execute(
        select(
            cast(LLMUsage.created_at, Date).label("date"),
            func.count(1).label("calls"),
            func.sum(LLMUsage.cost_usd).label("cost_usd"),
            func.count(1).filter(LLMUsage.provider == "local").label("local_calls"),
            func.count(1).filter(LLMUsage.provider == "cloud").label("cloud_calls"),
        )
        .group_by(cast(LLMUsage.created_at, Date))
        .order_by(cast(LLMUsage.created_at, Date).desc())
        .limit(30)
    )

    # Recent calls (last 20)
    recent_result = await db.execute(
        select(LLMUsage)
        .order_by(LLMUsage.created_at.desc())
        .limit(20)
    )

    return {
        "totals": {
            "total_calls": t.total_calls,
            "total_input_tokens": t.total_input_tokens,
            "total_output_tokens": t.total_output_tokens,
            "total_cost_usd": round(float(t.total_cost_usd), 6),
            "local_calls": t.local_calls,
            "cloud_calls": t.cloud_calls,
        },
        "by_task": [
            {
                "task_type": row.task_type,
                "calls": row.calls,
                "input_tokens": row.input_tokens,
                "output_tokens": row.output_tokens,
                "cost_usd": round(float(row.cost_usd), 6),
            }
            for row in by_task_result.all()
        ],
        "daily": [
            {
                "date": row.date.isoformat(),
                "calls": row.calls,
                "cost_usd": round(float(row.cost_usd), 6),
                "local_calls": row.local_calls,
                "cloud_calls": row.cloud_calls,
            }
            for row in daily_result.all()
        ],
        "recent": [
            {
                "task_type": r.task_type,
                "model": r.model,
                "provider": r.provider,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "cost_usd": round(float(r.cost_usd), 6),
                "created_at": r.created_at.isoformat(),
            }
            for r in recent_result.scalars().all()
        ],
    }
