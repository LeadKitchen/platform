"""Standalone Docling parsing service for the knowledge-base ingestion job.

Kept as a separate Python process instead of a library call from the
TypeScript job (`packages/jobs/src/trigger/ingest-knowledge-document.ts`)
because Docling itself, its layout/table models, and OCR (Tesseract) are a
Python/native-lib stack that has no equivalent in the Bun/Node runtime the
rest of the platform runs on. The job calls this over HTTP through
`packages/jobs/src/docling-client.ts` and always has a same-process
unpdf/mammoth fallback if this service is unreachable or returns a
low-quality extraction.
"""

import logging
import tempfile
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger("docling-parser")

# OCR on so scanned pages still yield text instead of nothing; table
# structure on so tables round-trip as markdown pipe-tables rather than a
# jumble of cell text in reading order.
_pdf_options = PdfPipelineOptions()
_pdf_options.do_ocr = True
_pdf_options.do_table_structure = True
_pdf_options.table_structure_options.do_cell_matching = True

# Built once at import time: loading Docling's layout/table models per
# request would dominate latency far more than the parse itself.
converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=_pdf_options),
    }
)

app = FastAPI(title="docling-parser")

ALLOWED_SUFFIXES = {".pdf", ".docx"}
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # matches MAX_UPLOAD_SIZE_BYTES in @acme/storage


class ParseResponse(BaseModel):
    text: str
    page_count: int
    table_count: int
    avg_chars_per_page: float


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse", response_model=ParseResponse)
async def parse(file: UploadFile = File(...)) -> ParseResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(400, f"Unsupported file type: {suffix or 'unknown'}")

    body = await file.read()
    if not body:
        raise HTTPException(400, "Empty file")
    if len(body) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(413, "File exceeds maximum size")

    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(body)
        tmp.flush()
        try:
            result = converter.convert(tmp.name)
        except Exception as exc:  # docling raises assorted parser-specific errors
            logger.exception("Docling conversion failed for %s", file.filename)
            raise HTTPException(422, f"Failed to parse document: {exc}") from exc

    document = result.document
    # Markdown (not plain text) so table structure survives into chunking —
    # the ingestion job's chunker (packages/ai/src/knowledge/chunk.ts) is
    # paragraph-aware and treats a markdown table as one opaque block.
    text = document.export_to_markdown()
    page_count = len(document.pages) if document.pages else 1
    table_count = len(document.tables)

    return ParseResponse(
        text=text,
        page_count=page_count,
        table_count=table_count,
        avg_chars_per_page=len(text) / page_count,
    )
