"""Knowledge base service — chunk, embed, and store articles for RAG."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.task_router import embed, tag_topics, llm_tracker
from app.models.database import Article, Embedding, KnowledgeItem
from app.services.text_processing import chunk_text

logger = logging.getLogger(__name__)

# In-memory lock to prevent concurrent learn-now processing
_learn_now_lock = asyncio.Lock()


class LearnNowStatus:
    def __init__(self):
        self.is_processing = False
        self.total = 0
        self.current = 0
        self.stage = ""
        self.llm_mode: str | None = None  # "local" | "cloud" | None
        self.last_result: dict | None = None

    def to_dict(self):
        return {
            "is_processing": self.is_processing,
            "total": self.total,
            "current": self.current,
            "stage": self.stage,
            "llm_mode": llm_tracker.current_mode if self.is_processing else self.llm_mode,
            "last_result": self.last_result,
        }


learn_now_status = LearnNowStatus()


async def index_article_to_kb(article: Article, db: AsyncSession) -> str:
    """Chunk, embed, and store a single article in the knowledge base.

    Returns the KnowledgeItem ID.
    """
    text = article.clean_text or ""
    if not text.strip():
        raise ValueError(f"Article {article.id} has no extractable text")

    # Chunk
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError(f"Article {article.id} produced no chunks")

    logger.info(f"Indexing article {article.id}: {len(chunks)} chunks")

    # Tag topics
    try:
        tags = await tag_topics(text)
    except Exception as e:
        logger.warning(f"Tagging failed for {article.id}: {e}")
        tags = ["General"]

    # Embed all chunks
    embeddings = await embed(chunks)

    # Create KnowledgeItem
    ki = KnowledgeItem(
        source_type="article",
        source_id=article.id,
        title=article.title or article.url,
        url=article.url,
        topic_tags=tags,
        full_text=text,
    )
    db.add(ki)
    await db.flush()

    # Create Embedding rows
    for i, (chunk, vector) in enumerate(zip(chunks, embeddings)):
        emb = Embedding(
            knowledge_item_id=ki.id,
            chunk_index=i,
            chunk_text=chunk,
            embedding=vector,
        )
        db.add(emb)

    # Update article status
    article.status = "kb_indexed"
    article.processed_at = datetime.now(timezone.utc)

    logger.info(f"Indexed article {article.id} as KnowledgeItem {ki.id}")
    return str(ki.id)


async def index_articles_to_kb(article_ids: list, db: AsyncSession) -> dict:
    """Index multiple articles to KB. Returns summary of results."""
    results = {"indexed": 0, "failed": 0, "errors": []}

    for article_id in article_ids:
        result = await db.execute(
            select(Article).where(Article.id == article_id)
        )
        article = result.scalar_one_or_none()
        if not article:
            results["failed"] += 1
            results["errors"].append(f"Article {article_id} not found")
            continue

        try:
            await index_article_to_kb(article, db)
            results["indexed"] += 1
        except Exception as e:
            logger.error(f"Failed to index article {article_id}: {e}")
            results["failed"] += 1
            results["errors"].append(f"{article_id}: {e}")

    await db.commit()
    return results


def start_learn_now_in_background(article_ids: list[str]) -> dict:
    """Kick off learn-now indexing as a background task. Returns immediately."""
    if _learn_now_lock.locked():
        return {"ok": False, "detail": "Learn Now processing already in progress"}

    asyncio.get_event_loop().create_task(_background_learn_now(article_ids))
    return {"ok": True, "detail": "Indexing started"}


async def _background_learn_now(article_ids: list[str]):
    """Run learn-now pipeline with its own DB session."""
    from app.core.database import async_session

    async with _learn_now_lock:
        learn_now_status.is_processing = True
        learn_now_status.total = len(article_ids)
        learn_now_status.current = 0
        learn_now_status.stage = "Starting"
        llm_tracker.reset()

        indexed = 0
        failed = 0

        try:
            async with async_session() as db:
                for i, article_id in enumerate(article_ids):
                    learn_now_status.current = i + 1
                    learn_now_status.stage = f"Indexing {i + 1}/{len(article_ids)}"

                    result = await db.execute(
                        select(Article).where(Article.id == article_id)
                    )
                    article = result.scalar_one_or_none()
                    if not article:
                        failed += 1
                        continue

                    try:
                        await index_article_to_kb(article, db)
                        indexed += 1
                    except Exception as e:
                        logger.error(f"Learn Now failed for {article_id}: {e}")
                        article.status = "failed"
                        failed += 1

                await db.commit()

            learn_now_status.last_result = {
                "ok": True,
                "indexed": indexed,
                "failed": failed,
            }
        except Exception as e:
            logger.error(f"Background learn-now failed: {e}")
            learn_now_status.last_result = {"ok": False, "detail": str(e)}
        finally:
            learn_now_status.is_processing = False
            learn_now_status.stage = ""
            learn_now_status.llm_mode = llm_tracker.current_mode
