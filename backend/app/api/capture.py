import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import Article
from app.services.content_extractor import extract_content
from app.services.knowledge_service import start_learn_now_in_background, learn_now_status

logger = logging.getLogger(__name__)
router = APIRouter()


class CaptureRequest(BaseModel):
    url: str
    mode: str = "consume_later"  # consume_later | learn_now


class CaptureResponse(BaseModel):
    ok: bool
    article_id: str | None = None
    duplicate: bool = False
    title: str | None = None
    extraction_quality: str | None = None


class BatchCaptureRequest(BaseModel):
    urls: list[str]
    mode: str = "consume_later"


class BatchCaptureItemResult(BaseModel):
    url: str
    ok: bool
    article_id: str | None = None
    duplicate: bool = False
    title: str | None = None
    extraction_quality: str | None = None
    error: str | None = None


class BatchCaptureResponse(BaseModel):
    ok: bool
    results: list[BatchCaptureItemResult]
    added: int
    duplicates: int
    failed: int


async def _capture_single(url: str, mode: str, db: AsyncSession) -> BatchCaptureItemResult:
    """Capture a single URL. Returns a result dict (never raises)."""
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    existing = await db.execute(select(Article).where(Article.url_hash == url_hash))
    if existing.scalar_one_or_none():
        return BatchCaptureItemResult(url=url, ok=True, duplicate=True)

    try:
        result = await extract_content(url)
    except Exception as e:
        logger.error(f"Extraction failed for {url}: {e}")
        return BatchCaptureItemResult(url=url, ok=False, error=str(e))

    status = "indexing" if mode == "learn_now" else "queued"

    article = Article(
        url=url,
        url_hash=url_hash,
        title=result.title,
        raw_html=result.raw_html,
        clean_text=result.clean_text,
        content_type=result.content_type,
        mode=mode,
        status=status,
        extraction_quality=result.extraction_quality,
        source_domain=result.source_domain,
        image_url=result.image_url,
    )
    db.add(article)
    await db.flush()

    return BatchCaptureItemResult(
        url=url,
        ok=True,
        article_id=str(article.id),
        title=result.title,
        extraction_quality=result.extraction_quality,
    )


@router.post("/api/articles")
async def capture_url(req: CaptureRequest, db: AsyncSession = Depends(get_db)):
    if req.mode not in ("consume_later", "learn_now"):
        raise HTTPException(status_code=400, detail="mode must be consume_later or learn_now")

    # Dedup check via URL hash
    url_hash = hashlib.sha256(req.url.encode()).hexdigest()
    existing = await db.execute(select(Article).where(Article.url_hash == url_hash))
    if existing.scalar_one_or_none():
        return CaptureResponse(ok=True, duplicate=True)

    # Extract article content at capture time
    try:
        result = await extract_content(req.url)
    except Exception as e:
        logger.error(f"Extraction failed for {req.url}: {e}")
        raise HTTPException(status_code=422, detail=f"Could not extract content: {e}")

    status = "indexing" if req.mode == "learn_now" else "queued"

    article = Article(
        url=req.url,
        url_hash=url_hash,
        title=result.title,
        raw_html=result.raw_html,
        clean_text=result.clean_text,
        content_type=result.content_type,
        mode=req.mode,
        status=status,
        extraction_quality=result.extraction_quality,
        source_domain=result.source_domain,
        image_url=result.image_url,
    )
    db.add(article)
    await db.commit()
    await db.refresh(article)

    response_data = CaptureResponse(
        ok=True,
        article_id=str(article.id),
        title=result.title,
        extraction_quality=result.extraction_quality,
    )

    # Learn Now: kick off background indexing, return 202
    if req.mode == "learn_now":
        start_learn_now_in_background([str(article.id)])
        return JSONResponse(status_code=202, content=response_data.model_dump())

    return response_data


@router.post("/api/articles/batch")
async def capture_batch(req: BatchCaptureRequest, db: AsyncSession = Depends(get_db)):
    """Capture multiple URLs at once. Extraction errors don't fail the whole batch."""
    if req.mode not in ("consume_later", "learn_now"):
        raise HTTPException(status_code=400, detail="mode must be consume_later or learn_now")

    if len(req.urls) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 URLs per batch")

    results = []
    for url in req.urls:
        result = await _capture_single(url, req.mode, db)
        results.append(result)

    await db.commit()

    added = sum(1 for r in results if r.ok and not r.duplicate)
    duplicates = sum(1 for r in results if r.duplicate)
    failed = sum(1 for r in results if not r.ok)

    response_data = BatchCaptureResponse(
        ok=True,
        results=results,
        added=added,
        duplicates=duplicates,
        failed=failed,
    )

    # Learn Now batch: kick off background indexing for all new articles
    if req.mode == "learn_now":
        article_ids = [r.article_id for r in results if r.ok and not r.duplicate and r.article_id]
        if article_ids:
            start_learn_now_in_background(article_ids)
        return JSONResponse(status_code=202, content=response_data.model_dump())

    return response_data


@router.get("/api/articles/indexing-status")
async def get_learn_now_status():
    """Get current Learn Now processing status."""
    return learn_now_status.to_dict()
