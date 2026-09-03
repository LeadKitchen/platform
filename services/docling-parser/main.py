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

import asyncio
import logging
import tempfile
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

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
# DocumentConverter isn't documented as safe for concurrent `convert()`
# calls sharing its model state, so requests take turns rather than racing
# each other through the (already single, process-wide) converter.
_convert_lock = asyncio.Lock()

ALLOWED_SUFFIXES = {".pdf", ".docx"}
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # matches MAX_UPLOAD_SIZE_BYTES in @acme/storage
# Content-Length covers the whole multipart body — boundaries and the file
# field's own headers, not just file bytes — so the early check needs slack
# over MAX_FILE_SIZE_BYTES or a file at exactly the advertised limit would be
# rejected here despite _read_upload below being willing to accept it.
MAX_MULTIPART_REQUEST_SIZE_BYTES = MAX_FILE_SIZE_BYTES + 1024 * 1024
_READ_CHUNK_SIZE = 1024 * 1024


class ContentLengthLimitMiddleware(BaseHTTPMiddleware):
    """Rejects an oversized `/parse` body from its Content-Length header
    alone, before Starlette buffers any of it into memory or a temp file."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/parse":
            content_length = request.headers.get("content-length")
            if content_length is None or not content_length.isdigit():
                return Response(
                    "Content-Length header is required", status_code=411
                )
            if int(content_length) > MAX_MULTIPART_REQUEST_SIZE_BYTES:
                return Response("File exceeds maximum size", status_code=413)
        return await call_next(request)


app = FastAPI(title="docling-parser")
app.add_middleware(ContentLengthLimitMiddleware)


class ParseResponse(BaseModel):
    text: str
    page_count: int
    table_count: int
    avg_chars_per_page: float


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


async def _read_upload(file: UploadFile) -> bytes:
    """Reads in bounded chunks rather than one `await file.read()` — a
    falsified Content-Length wouldn't be caught by the middleware above
    alone, since that only inspects the header, not the actual byte count
    streamed in."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_READ_CHUNK_SIZE):
        total += len(chunk)
        if total > MAX_FILE_SIZE_BYTES:
            raise HTTPException(413, "File exceeds maximum size")
        chunks.append(chunk)
    return b"".join(chunks)


@app.post("/parse", response_model=ParseResponse)
async def parse(file: UploadFile = File(...)) -> ParseResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(400, f"Unsupported file type: {suffix or 'unknown'}")

    body = await _read_upload(file)
    if not body:
        raise HTTPException(400, "Empty file")

    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(body)
        tmp.flush()
        try:
            # `DocumentConverter.convert` is synchronous and CPU-bound (OCR,
            # table structure) — running it inline here would stall this
            # worker's event loop, including /health, for the duration of
            # every parse. `run_in_threadpool` moves it off the loop; the
            # lock above keeps two in-flight parses from touching the
            # shared converter at once.
            async with _convert_lock:
                result = await run_in_threadpool(converter.convert, tmp.name)
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
