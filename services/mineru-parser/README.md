# mineru-parser

Second-tier parsing service for the knowledge-base ingestion job
(`packages/jobs/src/trigger/ingest-knowledge-document.ts`, via
`packages/jobs/src/mineru-client.ts`). Wraps
[MinerU](https://github.com/opendatalab/MinerU) behind the same small HTTP
API as [`services/docling-parser`](../docling-parser).

Not the default parser: the ingestion job tries Docling first
(`DOCLING_SERVICE_URL`) and only falls through to this service when Docling
is unconfigured, unreachable, or returns a low-quality extraction — MinerU's
CPU pipeline is minutes rather than seconds per document, so it is reserved
for the scans and layout-heavy PDFs Docling struggles with. If this service
also fails or is unset, the job falls back further to `unpdf`. See the
"Загрузка документов администратором" section in
[`docs/ai-module.md`](../../docs/ai-module.md).

PDF only — MinerU's document support is broader, but DOCX already has a
working path through Docling/mammoth, so this service stays scoped to the
case it actually needs to cover.

## Run locally

```bash
docker compose up mineru
```

Or without Docker (needs 16GB+ RAM per the upstream project's guidance —
the pipeline backend used here is CPU-only):

```bash
cd services/mineru-parser
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
mineru-models-download -s huggingface -m all
export MINERU_MODEL_SOURCE=local
uvicorn main:app --reload --port 8089
```

Then in `.env`:

```
MINERU_SERVICE_URL=http://localhost:8089
```

## API

`POST /parse` — multipart form, field `file` (`.pdf` only, ≤20MB).

```json
{
  "text": "markdown output from MinerU",
  "page_count": 4,
  "table_count": 2,
  "avg_chars_per_page": 812.5
}
```

`page_count` is read directly from the source PDF (`pypdf`), not from
MinerU's own output, so it stays correct across MinerU version bumps.
`table_count` is a best-effort scan of MinerU's `content_list.json` and
degrades to `0` rather than failing the request if that schema changes.
`avg_chars_per_page` is what the caller uses as its own quality signal.

`GET /health` — used by the `docker-compose.yml` healthcheck.
