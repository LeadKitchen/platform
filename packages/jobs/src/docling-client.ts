import { env } from "@acme/config";

/**
 * Thin client for the standalone Docling microservice
 * (`services/docling-parser`) — structure-aware PDF/DOCX extraction
 * (reading order, tables) that `unpdf`/`mammoth` don't attempt.
 *
 * Every failure mode (service not configured, unreachable, times out,
 * rejects the file, or returns text too sparse to be a real extraction)
 * comes back as `{ ok: false, reason }` rather than throwing. The caller
 * (`ingest-knowledge-document.ts`) falls back to `unpdf`/`mammoth` in every
 * case — same "a parser problem costs recall quality, never blocks
 * ingestion" contract the rest of the pipeline already follows (see the
 * embedding-outage handling in `strategies/knowledge/org-rag.ts`).
 */

export type DoclingParseOutcome =
  | { ok: true; text: string; pageCount: number; tableCount: number }
  | { ok: false; reason: string };

interface DoclingParseResponse {
  text: string;
  page_count: number;
  table_count: number;
  avg_chars_per_page: number;
}

// Below this, treat the extraction as failed rather than indexing near-empty
// chunks — e.g. a scanned page OCR came back blank, or the file was mostly
// whitespace/images. Matches the "quality check" step ahead of the fallback.
const MIN_AVG_CHARS_PER_PAGE = 20;

export interface ParseWithDoclingOptions {
  /** Defaults to `env.DOCLING_SERVICE_URL`. Overridable so this stays testable without mutating process env. */
  baseUrl?: string;
  /** Defaults to `env.DOCLING_TIMEOUT_MS`. */
  timeoutMs?: number;
}

export async function parseWithDocling(
  buffer: Buffer,
  filename: string,
  options: ParseWithDoclingOptions = {},
): Promise<DoclingParseOutcome> {
  const baseUrl = options.baseUrl ?? env.DOCLING_SERVICE_URL;
  if (!baseUrl) return { ok: false, reason: "not-configured" };
  const timeoutMs = options.timeoutMs ?? env.DOCLING_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)]), filename);

    const response = await fetch(new URL("/parse", baseUrl), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `http-${response.status}` };
    }

    const body = (await response.json()) as DoclingParseResponse;
    if (
      typeof body.text !== "string" ||
      typeof body.avg_chars_per_page !== "number"
    ) {
      return { ok: false, reason: "malformed-response" };
    }
    if (body.avg_chars_per_page < MIN_AVG_CHARS_PER_PAGE) {
      return { ok: false, reason: "low-quality" };
    }

    return {
      ok: true,
      text: body.text,
      pageCount: body.page_count,
      tableCount: body.table_count,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown-error",
    };
  } finally {
    clearTimeout(timer);
  }
}
