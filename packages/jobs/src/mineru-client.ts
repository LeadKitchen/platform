import { env } from "@acme/config";
import { z } from "zod";

/**
 * Thin client for MinerU's own FastAPI server
 * (https://github.com/opendatalab/MinerU, `mineru[api]`) — the upstream
 * project's REST API, deployed as-is rather than behind a custom wrapper.
 * Second tier of the parser cascade, tried only after `docling-client.ts`
 * fails or reports low quality.
 *
 * There used to be a repo-local `services/mineru-parser` FastAPI wrapper
 * exposing a `POST /parse` contract this client spoke instead — but that
 * service was never built or deployed, while `MINERU_SERVICE_URL` pointed
 * at a real MinerU deployment the whole time. Every request 404'd (`/parse`
 * doesn't exist on MinerU's own API), silently falling through to
 * unpdf/mammoth regardless of the document's content. This client now
 * speaks MinerU's real `POST /file_parse` contract directly — the
 * synchronous variant that waits for the parse and returns the result in
 * one response, rather than `/tasks` + polling.
 */

export type MinerUParseOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export interface ParseWithMinerUOptions {
  /** Defaults to `env.MINERU_SERVICE_URL`. Overridable so this stays testable without mutating process env. */
  baseUrl?: string;
  /** Defaults to `env.MINERU_TIMEOUT_MS`. */
  timeoutMs?: number;
}

// Below this, treat the extraction as failed rather than indexing a
// near-empty document — e.g. a scanned page's OCR came back blank. MinerU
// doesn't report a page count in this response, so this is an absolute
// floor rather than a per-page average.
const MIN_TEXT_LENGTH = 40;

// `/file_parse` returns one of two shapes depending on outcome: a
// top-level `status: "failed"` (a backend/dependency error on MinerU's
// side — e.g. a missing Python package for the selected `backend`) or
// `{ results: { <filename>: { md_content } } }` on success. Modeled as a
// union rather than one lenient object so a genuine backend failure comes
// back with its real reason instead of "malformed-response".
const fileParseResponseSchema = z.union([
  z.object({ status: z.literal("failed"), error: z.string().optional() }),
  z.object({
    results: z.record(
      z.string(),
      z.object({ md_content: z.string().optional() }),
    ),
  }),
]);

export async function parseWithMinerU(
  buffer: Buffer,
  filename: string,
  options: ParseWithMinerUOptions = {},
): Promise<MinerUParseOutcome> {
  const baseUrl = options.baseUrl ?? env.MINERU_SERVICE_URL;
  if (!baseUrl) return { ok: false, reason: "not-configured" };
  const timeoutMs = options.timeoutMs ?? env.MINERU_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(buffer)]), filename);
    // "pipeline" is MinerU's general-purpose, multi-language, CPU-only
    // backend — the right fit for scans in any language, unlike
    // vlm-engine (Chinese/English only) or the *-http-client backends
    // (need a separately hosted OpenAI-compatible model server).
    form.append("backend", "pipeline");
    form.append("parse_method", "auto");

    const response = await fetch(new URL("/file_parse", baseUrl), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `http-${response.status}` };
    }

    const parsed = fileParseResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, reason: "malformed-response" };
    }
    if ("status" in parsed.data) {
      return { ok: false, reason: parsed.data.error ?? "task-failed" };
    }

    const [result] = Object.values(parsed.data.results);
    const text = (result?.md_content ?? "").trim();
    if (text.length < MIN_TEXT_LENGTH) {
      return { ok: false, reason: "low-quality" };
    }

    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown-error",
    };
  } finally {
    clearTimeout(timer);
  }
}
