"""Standalone MinerU parsing service for the knowledge-base ingestion job.

Second-tier parser, tried only after Docling
(`services/docling-parser`) fails or returns a low-quality extraction —
the "Quality Check → Problem Page → MinerU" branch of the pipeline.
MinerU's layout/OCR pipeline is heavier (CPU-bound, minutes rather than
seconds per document) and better suited to scanned or otherwise
hard-to-parse PDFs than to being the default path for every upload.

Runs MinerU through its CLI (`mineru -p ... -o ... -b pipeline`) in a
subprocess rather than importing an internal Python API: the CLI is the one
part of MinerU's surface that stays stable across releases, and shelling
out means a MinerU version bump never breaks this service's import graph.
Page count is read directly from the source PDF with `pypdf`, independent
of MinerU's own (version-sensitive) output JSON schema; table count is a
best-effort scan of `content_list.json` that degrades to 0 rather than
failing the whole parse if that schema shifts.

The job calls this over HTTP through `packages/jobs/src/mineru-client.ts`
and always has Docling and, after that, a same-process unpdf/mammoth
fallback if this service is also unreachable or low-quality.
"""

import asyncio
import json
import logging
import os
import tempfile
from pathlib import Path

import pypdf
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger("mineru-parser")

ALLOWED_SUFFIXES = {".pdf"}
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # matches MAX_UPLOAD_SIZE_BYTES in @acme/storage
# Content-Length covers the whole multipart body — boundaries and the file
# field's own headers, not just file bytes — so the early check needs slack
# over MAX_FILE_SIZE_BYTES or a file at exactly the advertised limit would be
# rejected here despite _read_upload below being willing to accept it.
MAX_MULTIPART_REQUEST_SIZE_BYTES = MAX_FILE_SIZE_BYTES + 1024 * 1024
_READ_CHUNK_SIZE = 1024 * 1024
MINERU_TIMEOUT_MS = int(os.getenv("MINERU_TIMEOUT_MS", "180000"))

# MinerU's pipeline backend is CPU-only and resource-heavy (16GB+ RAM
# recommended per document) — one parse at a time, same reasoning as
# Docling's converter lock, but here it also keeps the OS process count
# under control since each parse is a full `mineru` subprocess.
_parse_lock = asyncio.Lock()


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


app = FastAPI(title="mineru-parser")
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


def _count_pdf_pages(pdf_path: Path) -> int:
    try:
        return max(1, len(pypdf.PdfReader(str(pdf_path)).pages))
    except Exception:
        logger.warning("Could not count PDF pages, defaulting to 1", exc_info=True)
        return 1


def _find_first(root: Path, pattern: str) -> Path | None:
    matches = sorted(root.rglob(pattern))
    return matches[0] if matches else None


def _count_tables(content_list_path: Path | None) -> int:
    """Best-effort: MinerU's content_list.json block schema has shifted
    across releases, so a parsing failure here costs the table_count
    metadata field, never the whole parse."""
    if content_list_path is None:
        return 0
    try:
        items = json.loads(content_list_path.read_text(encoding="utf-8"))
        if not isinstance(items, list):
            return 0
        return sum(
            1
            for item in items
            if isinstance(item, dict) and item.get("type") == "table"
        )
    except Exception:
        logger.warning("Could not count tables in MinerU output", exc_info=True)
        return 0


async def _run_mineru(pdf_path: Path, output_dir: Path) -> None:
    process = await asyncio.create_subprocess_exec(
        "mineru",
        "-p",
        str(pdf_path),
        "-o",
        str(output_dir),
        "-b",
        "pipeline",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(
            process.communicate(), timeout=MINERU_TIMEOUT_MS / 1000
        )
    except asyncio.TimeoutError as exc:
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        await process.communicate()
        raise RuntimeError(f"mineru timed out after {MINERU_TIMEOUT_MS} ms") from exc
    if process.returncode != 0:
        raise RuntimeError(
            f"mineru exited {process.returncode}: "
            f"{stderr.decode(errors='replace')[-2000:]}"
        )


@app.post("/parse", response_model=ParseResponse)
async def parse(file: UploadFile = File(...)) -> ParseResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(400, f"Unsupported file type: {suffix or 'unknown'}")

    body = await _read_upload(file)
    if not body:
        raise HTTPException(400, "Empty file")

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_dir_path = Path(tmp_dir)
        pdf_path = tmp_dir_path / f"input{suffix}"
        pdf_path.write_bytes(body)
        page_count = _count_pdf_pages(pdf_path)

        output_dir = tmp_dir_path / "out"
        output_dir.mkdir()

        try:
            async with _parse_lock:
                await _run_mineru(pdf_path, output_dir)
        except Exception as exc:
            logger.exception("MinerU conversion failed for %s", file.filename)
            raise HTTPException(422, f"Failed to parse document: {exc}") from exc

        markdown_path = _find_first(output_dir, "*.md")
        if markdown_path is None:
            raise HTTPException(422, "MinerU produced no markdown output")
        text = markdown_path.read_text(encoding="utf-8")

        content_list_path = _find_first(output_dir, "*content_list*.json")
        table_count = _count_tables(content_list_path)

    return ParseResponse(
        text=text,
        page_count=page_count,
        table_count=table_count,
        avg_chars_per_page=len(text) / page_count,
    )
