import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.task_router import embed, rag_answer, llm_tracker
from app.models.database import Embedding, KnowledgeItem

logger = logging.getLogger(__name__)
router = APIRouter()


class QueryRequest(BaseModel):
    question: str


class SourceChunk(BaseModel):
    knowledge_item_id: str
    chunk_index: int
    chunk_text: str
    title: str
    url: str | None
    similarity: float


class QueryResponse(BaseModel):
    ok: bool
    answer: str
    sources: list[SourceChunk]
    related_questions: list[str]
    llm_mode: str | None = None


class KBItem(BaseModel):
    id: str
    title: str
    url: str | None
    source_type: str
    topic_tags: list[str]
    created_at: str
    chunk_count: int


class KBListResponse(BaseModel):
    items: list[KBItem]
    total: int


@router.post("/api/knowledge/query", response_model=QueryResponse)
async def query_kb(req: QueryRequest, db: AsyncSession = Depends(get_db)):
    """RAG query: embed question → pgvector top-5 → LLM answer with citations."""
    if not req.question.strip():
        return QueryResponse(ok=False, answer="Please provide a question.", sources=[], related_questions=[])

    llm_tracker.reset()

    # Embed the question
    question_embedding = (await embed([req.question]))[0]

    # pgvector cosine similarity search — top 5 chunks
    embedding_str = "[" + ",".join(str(x) for x in question_embedding) + "]"
    result = await db.execute(
        text("""
            SELECT e.id, e.knowledge_item_id, e.chunk_index, e.chunk_text,
                   ki.title, ki.url,
                   1 - (e.embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM embeddings e
            JOIN knowledge_items ki ON ki.id = e.knowledge_item_id
            ORDER BY e.embedding <=> CAST(:embedding AS vector)
            LIMIT 5
        """),
        {"embedding": embedding_str},
    )
    rows = result.all()

    if not rows:
        return QueryResponse(
            ok=True,
            answer="No knowledge base content found. Add articles using 'Learn Now' or promote digest clusters.",
            sources=[],
            related_questions=[],
        )

    # Build context for RAG
    context_chunks = [row.chunk_text for row in rows]
    sources = [
        SourceChunk(
            knowledge_item_id=str(row.knowledge_item_id),
            chunk_index=row.chunk_index,
            chunk_text=row.chunk_text,
            title=row.title,
            url=row.url,
            similarity=round(float(row.similarity), 4),
        )
        for row in rows
    ]

    # Generate answer
    try:
        answer_result = await rag_answer(req.question, context_chunks)
        return QueryResponse(
            ok=True,
            answer=answer_result.get("answer", ""),
            sources=sources,
            related_questions=answer_result.get("related_questions", []),
            llm_mode=llm_tracker.current_mode,
        )
    except Exception as e:
        logger.error(f"RAG answer generation failed: {e}")
        return QueryResponse(
            ok=False,
            answer=f"Failed to generate answer: {e}",
            sources=sources,
            related_questions=[],
            llm_mode=llm_tracker.current_mode,
        )


@router.get("/api/knowledge", response_model=KBListResponse)
async def list_kb(db: AsyncSession = Depends(get_db)):
    """List all knowledge base items with chunk counts."""
    chunk_count_sq = (
        select(Embedding.knowledge_item_id, func.count(1).label("chunk_count"))
        .group_by(Embedding.knowledge_item_id)
        .subquery()
    )
    result = await db.execute(
        select(KnowledgeItem, func.coalesce(chunk_count_sq.c.chunk_count, 0).label("chunk_count"))
        .outerjoin(chunk_count_sq, KnowledgeItem.id == chunk_count_sq.c.knowledge_item_id)
        .order_by(KnowledgeItem.created_at.desc())
    )
    rows = result.all()

    return KBListResponse(
        total=len(rows),
        items=[
            KBItem(
                id=str(ki.id),
                title=ki.title,
                url=ki.url,
                source_type=ki.source_type,
                topic_tags=ki.topic_tags or [],
                created_at=ki.created_at.isoformat(),
                chunk_count=chunk_count,
            )
            for ki, chunk_count in rows
        ],
    )
