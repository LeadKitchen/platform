# docling-parser

Standalone parsing service for the knowledge-base ingestion job
(`packages/jobs/src/trigger/ingest-knowledge-document.ts`, via
`packages/jobs/src/docling-client.ts`). Wraps
[Docling](https://github.com/docling-project/docling) behind a small HTTP
API so a Python/native-lib-only stack (layout models, OCR) doesn't have to
run inside the Bun/Node job runtime.

Not wired into the pipeline unless `DOCLING_SERVICE_URL` is set — the job
falls back to `unpdf`/`mammoth` (plain text, no OCR, no table structure)
whenever this service is unset, unreachable, or returns a low-quality
extraction. See the "Загрузка документов администратором" section in
[`docs/ai-module.md`](../../docs/ai-module.md).

## Run locally

```bash
docker compose up docling
```

Or without Docker:

```bash
cd services/docling-parser
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8088
```

Then in `.env`:

```
DOCLING_SERVICE_URL=http://localhost:8088
```

## API

`POST /parse` — multipart form, field `file` (`.pdf` or `.docx`, ≤20MB).

```json
{
  "text": "markdown, tables as pipe-tables",
  "page_count": 4,
  "table_count": 2,
  "avg_chars_per_page": 812.5
}
```

`avg_chars_per_page` is what the caller uses as its quality signal — below
~20 chars/page it treats the extraction as failed and falls back.

`GET /health` — used by the `docker-compose.yml` healthcheck.
