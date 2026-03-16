from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import UserSetting

router = APIRouter()

MAX_TOPICS = 20


class FocusedTopicsRequest(BaseModel):
    topics: list[str] = Field(max_length=MAX_TOPICS)


class FocusedTopicsResponse(BaseModel):
    topics: list[str]


@router.get("/api/settings/focused-topics", response_model=FocusedTopicsResponse)
async def get_focused_topics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserSetting).where(UserSetting.key == "focused_topics")
    )
    row = result.scalar_one_or_none()
    return {"topics": row.value if row else []}


@router.put("/api/settings/focused-topics", response_model=FocusedTopicsResponse)
async def put_focused_topics(
    body: FocusedTopicsRequest,
    db: AsyncSession = Depends(get_db),
):
    # Deduplicate and strip whitespace, drop empties
    clean = list(dict.fromkeys(t.strip() for t in body.topics if t.strip()))

    result = await db.execute(
        select(UserSetting).where(UserSetting.key == "focused_topics")
    )
    row = result.scalar_one_or_none()

    if row:
        row.value = clean
    else:
        db.add(UserSetting(key="focused_topics", value=clean))

    await db.commit()
    return {"topics": clean}
