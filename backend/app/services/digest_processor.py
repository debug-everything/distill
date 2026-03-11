"""Digest processing pipeline: queued articles → clusters."""

import asyncio
import logging
from datetime import date, datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.task_router import embed, summarize, tag_topics, llm_tracker, refresh_focused_topics
from app.models.database import Article, Cluster, ClusterSource
from app.services.text_processing import chunk_text, cluster_by_similarity

logger = logging.getLogger(__name__)

# In-memory lock to prevent concurrent processing
_processing_lock = asyncio.Lock()


class ProcessingStatus:
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


status = ProcessingStatus()


def start_processing_in_background() -> dict:
    """Kick off digest processing as a background task. Returns immediately."""
    if _processing_lock.locked():
        return {"ok": False, "detail": "Processing already in progress"}

    asyncio.get_event_loop().create_task(_background_process())
    return {"ok": True, "detail": "Processing started"}


async def _background_process():
    """Run the pipeline with its own DB session (independent of request lifecycle)."""
    from app.core.database import async_session

    async with _processing_lock:
        status.is_processing = True
        llm_tracker.reset()
        try:
            async with async_session() as db:
                result = await _run_pipeline(db)
                status.last_result = result
        except Exception as e:
            logger.error(f"Background processing failed: {e}")
            status.last_result = {"ok": False, "detail": str(e)}
        finally:
            status.is_processing = False
            status.stage = ""
            status.llm_mode = llm_tracker.current_mode


async def _run_pipeline(db: AsyncSession) -> dict:
    # Refresh focused topics so prompts use latest user preferences
    await refresh_focused_topics()

    # Fetch queued consume_later articles
    result = await db.execute(
        select(Article).where(
            Article.status == "queued",
            Article.mode == "consume_later",
        )
    )
    articles = list(result.scalars().all())

    if not articles:
        return {"ok": True, "clusters_created": 0, "articles_processed": 0}

    status.total = len(articles)
    logger.info(f"Processing {len(articles)} queued articles")

    # Mark as processing
    article_ids = [a.id for a in articles]
    await db.execute(
        update(Article).where(Article.id.in_(article_ids)).values(status="processing")
    )
    await db.commit()

    # Step 1: Summarize each article
    summaries = []
    for i, article in enumerate(articles):
        status.current = i + 1
        status.stage = f"Summarizing {i + 1}/{len(articles)}"
        logger.info(f"Summarizing: {article.title}")

        text = article.clean_text or ""
        if not text.strip():
            summaries.append({
                "headline": article.title or "Untitled",
                "summary": "No content extracted.",
                "bullets": [],
                "quotes": [],
            })
            continue

        try:
            summary = await summarize(text)
            summaries.append(summary)
        except Exception as e:
            logger.error(f"Summarize failed for {article.id}: {e}")
            summaries.append({
                "headline": article.title or "Untitled",
                "summary": f"Summarization failed: {e}",
                "bullets": [],
                "quotes": [],
            })

    # Step 2: Tag topics
    status.stage = "Tagging topics"
    topic_tags_list = []
    for i, article in enumerate(articles):
        text = article.clean_text or article.title or ""
        try:
            tags = await tag_topics(text)
            topic_tags_list.append(tags)
        except Exception as e:
            logger.error(f"Tagging failed for {article.id}: {e}")
            topic_tags_list.append(["General"])

    # Step 3: Embed headlines for clustering
    status.stage = "Embedding for clustering"
    headlines = [s.get("headline", "") or articles[i].title or "" for i, s in enumerate(summaries)]
    try:
        headline_embeddings = await embed(headlines)
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        # Fall back to individual clusters
        headline_embeddings = None

    # Step 4: Cluster
    status.stage = "Clustering"
    if headline_embeddings and len(headline_embeddings) > 1:
        clusters_indices = cluster_by_similarity(headline_embeddings)
    else:
        clusters_indices = [[i] for i in range(len(articles))]

    # Step 5: Write clusters
    status.stage = "Writing clusters"
    today = date.today()
    clusters_created = 0

    for cluster_idx_list in clusters_indices:
        is_merged = len(cluster_idx_list) > 1

        if is_merged:
            # Merge summaries for multi-article clusters
            merged_text = "\n\n".join(
                summaries[i].get("summary", "") for i in cluster_idx_list
            )
            try:
                merged_summary = await summarize(merged_text, content_type="merged articles")
            except Exception:
                merged_summary = summaries[cluster_idx_list[0]]
        else:
            merged_summary = summaries[cluster_idx_list[0]]

        # Combine topic tags
        all_tags = set()
        for i in cluster_idx_list:
            all_tags.update(topic_tags_list[i])

        cluster = Cluster(
            digest_date=today,
            title=merged_summary.get("headline", "Untitled"),
            headline=merged_summary.get("headline", ""),
            summary=merged_summary.get("summary", ""),
            bullets=merged_summary.get("bullets", []),
            quotes=merged_summary.get("quotes", []),
            topic_tags=list(all_tags),
            source_count=len(cluster_idx_list),
            is_merged=is_merged,
            status="unread",
        )
        db.add(cluster)
        await db.flush()

        # Add sources
        for i in cluster_idx_list:
            article = articles[i]
            source = ClusterSource(
                cluster_id=cluster.id,
                article_id=article.id,
                source_url=article.url,
                source_name=article.source_domain,
                content_type=article.content_type,
                image_url=article.image_url,
            )
            db.add(source)

        clusters_created += 1

    # Mark articles as ready
    await db.execute(
        update(Article)
        .where(Article.id.in_(article_ids))
        .values(status="ready", processed_at=datetime.now(timezone.utc))
    )
    await db.commit()

    logger.info(f"Created {clusters_created} clusters from {len(articles)} articles")
    return {
        "ok": True,
        "clusters_created": clusters_created,
        "articles_processed": len(articles),
    }
