"""Documents API — PDF upload and ingestion to knowledge base."""

import asyncio
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.task_router import embed, tag_topics, llm_tracker
from app.models.database import Embedding, KnowledgeItem
from app.services.document_extractor import extract_pdf_text, extract_title_from_pdf
from app.services.text_processing import chunk_text

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_TYPES = {
    "application/pdf": ".pdf",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


class DocumentUploadResponse(BaseModel):
    ok: bool
    knowledge_item_id: str
    title: str
    chunk_count: int
    topic_tags: list[str]
    page_count: int


class DocumentIngestStatus(BaseModel):
    is_processing: bool
    stage: str
    filename: str | None
    llm_mode: str | None


# Simple in-memory status for the current upload
class _IngestStatus:
    def __init__(self):
        self.is_processing = False
        self.stage = ""
        self.filename: str | None = None

    def to_dict(self):
        return DocumentIngestStatus(
            is_processing=self.is_processing,
            stage=self.stage,
            filename=self.filename,
            llm_mode=llm_tracker.current_mode if self.is_processing else None,
        )


_status = _IngestStatus()
_ingest_lock = asyncio.Lock()


@router.post("/api/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile):
    """Upload a PDF and ingest it into the knowledge base.

    Extracts text, chunks it, generates topic tags, embeds all chunks,
    and stores as a KnowledgeItem with Embedding rows for RAG retrieval.
    """
    if _ingest_lock.locked():
        raise HTTPException(status_code=409, detail="Document ingestion already in progress")

    # Validate file type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type: {content_type}. Supported: PDF",
        )

    filename = file.filename or "document.pdf"

    # Read file into temp location
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
    if len(contents) == 0:
        raise HTTPException(status_code=422, detail="File is empty")

    async with _ingest_lock:
        _status.is_processing = True
        _status.filename = filename
        try:
            return await _ingest_pdf(contents, filename)
        finally:
            _status.is_processing = False
            _status.stage = ""
            _status.filename = None


async def _ingest_pdf(contents: bytes, filename: str) -> DocumentUploadResponse:
    """Extract, chunk, tag, embed, and store a PDF."""
    from app.core.database import async_session

    # Step 1: Extract text
    _status.stage = "Extracting text from PDF"
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
        tmp.write(contents)
        tmp.flush()
        try:
            full_text, metadata = await asyncio.to_thread(extract_pdf_text, tmp.name)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    title = extract_title_from_pdf(metadata, filename)
    page_count = metadata.get("page_count", 0)

    # Step 2: Chunk
    _status.stage = "Chunking text"
    chunks = chunk_text(full_text)
    if not chunks:
        raise HTTPException(status_code=422, detail="PDF produced no usable text chunks")

    # Step 3: Tag topics
    _status.stage = "Tagging topics"
    try:
        # Use first ~2000 chars for topic tagging
        tags = await tag_topics(full_text[:2000])
    except Exception as e:
        logger.warning("Topic tagging failed for %s: %s", filename, e)
        tags = ["General"]

    # Step 4: Embed all chunks
    _status.stage = f"Embedding {len(chunks)} chunks"
    embeddings = await embed(chunks)

    # Step 5: Store in DB
    _status.stage = "Saving to knowledge base"
    async with async_session() as db:
        ki = KnowledgeItem(
            source_type="document",
            source_id=None,
            title=title,
            url=None,
            topic_tags=tags,
            full_text=full_text,
        )
        db.add(ki)
        await db.flush()

        for i, (chunk, vector) in enumerate(zip(chunks, embeddings)):
            emb = Embedding(
                knowledge_item_id=ki.id,
                chunk_index=i,
                chunk_text=chunk,
                embedding=vector,
            )
            db.add(emb)

        await db.commit()

        logger.info("Ingested PDF '%s' as KnowledgeItem %s (%d chunks, %d pages)",
                     filename, ki.id, len(chunks), page_count)

        return DocumentUploadResponse(
            ok=True,
            knowledge_item_id=str(ki.id),
            title=title,
            chunk_count=len(chunks),
            topic_tags=tags,
            page_count=page_count,
        )


@router.get("/api/documents/ingest-status")
async def get_ingest_status() -> DocumentIngestStatus:
    return _status.to_dict()
