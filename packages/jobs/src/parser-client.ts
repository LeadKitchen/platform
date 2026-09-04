import { z } from "zod";

/**
 * Shared HTTP contract for the standalone document-parser microservices
 * (`services/docling-parser`, `services/mineru-parser`): both expose a
 * `POST /parse` multipart endpoint returning the same shape, so the two
 * TypeScript clients (`docling-client.ts`, `mineru-client.ts`) are thin
 * wrappers around this one implementation instead of duplicating the
 * fetch/timeout/validation/quality-gate logic twice.
 *
 * Every failure mode (service not configured, unreachable, times out,
 * rejects the file, or returns text too sparse to be a real extraction)
 * comes back as `{ ok: false, reason }` rather than throwing — callers fall
 * back to the next tier in every case, same "a parser problem costs recall
 * quality, never blocks ingestion" contract the rest of the pipeline
 * already follows (see the embedding-outage handling in
 * `strategies/knowledge/org-rag.ts`).
 */

export type ParserOutcome =
  | { ok: true; text: string; pageCount: number; tableCount: number }
  | { ok: false; reason: string };

// Validated in full — not just the two fields the quality gate reads — so a
// malformed `page_count`/`table_count` can't silently become `NaN`/`undefined`
// metadata on a chunk the ingestion job otherwise treats as a success.
const parseResponseSchema = z.object({
  text: z.string(),
  page_count: z.number(),
  table_count: z.number(),
  avg_chars_per_page: z.number(),
});

// Below this, treat the extraction as failed rather than indexing near-empty
// chunks — e.g. a scanned page OCR came back blank, or the file was mostly
// whitespace/images. Matches the "quality check" step ahead of the fallback.
const MIN_AVG_CHARS_PER_PAGE = 20;

export interface ParseWithServiceOptions {
  baseUrl: string | undefined;
  timeoutMs: number;
  buffer: Buffer;
  filename: string;
}

export async function parseWithService({
  baseUrl,
  timeoutMs,
  buffer,
  filename,
}: ParseWithServiceOptions): Promise<ParserOutcome> {
  if (!baseUrl) return { ok: false, reason: "not-configured" };

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

    const parsed = parseResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, reason: "malformed-response" };
    }
    const body = parsed.data;
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
