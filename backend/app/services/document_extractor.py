"""PDF text extraction using PyMuPDF."""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_pdf_text(file_path: str | Path) -> tuple[str, dict]:
    """Extract text from a PDF file. Returns (full_text, metadata).

    Metadata includes title, author, page_count, and creation_date when available.
    Raises ValueError if the file has no extractable text (scanned/image PDF).
    """
    import fitz  # PyMuPDF

    doc = fitz.open(str(file_path))
    meta = doc.metadata or {}

    pages = []
    for page in doc:
        text = page.get_text()
        if text.strip():
            pages.append(text.strip())

    doc.close()

    if not pages:
        raise ValueError("PDF has no extractable text (may be a scanned/image PDF)")

    full_text = "\n\n".join(pages)

    metadata = {
        "title": meta.get("title") or None,
        "author": meta.get("author") or None,
        "page_count": len(pages),
        "total_pages": doc.page_count,
        "creation_date": meta.get("creationDate") or None,
    }

    return full_text, metadata


def extract_title_from_pdf(metadata: dict, filename: str) -> str:
    """Get a display title from PDF metadata, falling back to filename."""
    if metadata.get("title") and len(metadata["title"].strip()) > 3:
        return metadata["title"].strip()
    # Strip extension from filename
    return Path(filename).stem.replace("_", " ").replace("-", " ")
