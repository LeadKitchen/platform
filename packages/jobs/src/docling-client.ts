import { env } from "@acme/config";
import { z } from "zod";

/**
 * Thin client for Docling Serve (https://github.com/docling-project/docling-serve)
 * — the upstream project's own REST API, deployed as-is rather than behind a
 * custom wrapper. First tier of the parser cascade; `mineru-client.ts` is
 * the second, tried only when this one fails or reports low quality.
 *
 * There used to be a repo-local `services/docling-parser` FastAPI wrapper
 * exposing a `POST /parse` contract this client spoke instead — but that
 * service was never built or deployed, while `DOCLING_SERVICE_URL` pointed
 * at a real `docling-serve` deployment the whole time. Every request 404'd
 * (`/parse` doesn't exist on `docling-serve`), silently falling through to
 * unpdf/mammoth regardless of the document's actual content — Docling was
 * never actually being used.
 *
 * Uses the async submit-then-poll flow (`/v1/convert/file/async` +
 * `/v1/status/poll/{task_id}` + `/v1/result/{task_id}`), not the
 * synchronous `/v1/convert/file`: a multi-page scanned document can
 * legitimately take minutes of OCR, and the synchronous endpoint is capped
 * by `docling-serve`'s own `DOCLING_SERVE_MAX_SYNC_WAIT` (120s by default)
 * — well under what a large scan needs — on top of whatever timeout the
 * ingress in front of it enforces on one held-open request. Polling in
 * short (`POLL_WAIT_SECONDS`) increments keeps every individual HTTP call
 * quick regardless of how long the overall conversion takes, bounded by
 * this function's own `timeoutMs` deadline rather than any one request's.
 */

export type DoclingParseOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export interface ParseWithDoclingOptions {
  /** Defaults to `env.DOCLING_SERVICE_URL`. Overridable so this stays testable without mutating process env. */
  baseUrl?: string;
  /** Defaults to `env.DOCLING_TIMEOUT_MS`. Bounds the whole submit+poll+result flow, not any single request. */
  timeoutMs?: number;
}

// Below this, treat the extraction as failed rather than indexing a
// near-empty document — e.g. a scanned page's OCR came back blank, or the
// file was mostly whitespace/images. `docling-serve` doesn't report a page
// count, so this is an absolute floor rather than a per-page average.
const MIN_TEXT_LENGTH = 40;

// How long each status-poll request asks docling-serve to hold the
// connection open for, waiting on a terminal status before responding.
// Short enough that no individual request risks tripping an unrelated
// proxy/ingress timeout, no matter how long the overall job takes.
const POLL_WAIT_SECONDS = 10;

const TERMINAL_STATUSES = new Set([
  "success",
  "partial_success",
  "failure",
  "skipped",
]);

const taskStatusSchema = z.object({
  task_id: z.string(),
  task_status: z.enum([
    "pending",
    "started",
    "failure",
    "success",
    "partial_success",
    "skipped",
  ]),
});

// `/v1/result/{task_id}` returns one of two shapes: the converted document
// on success/partial_success, or `TaskFailureResult` (discriminated by
// `kind`) when the task ended in `failure`/`skipped`. Modeled as a union
// rather than one lenient object so a genuine backend failure comes back
// with its real message instead of "malformed-response".
const resultSchema = z.union([
  z.object({
    status: z.string(),
    document: z.object({ md_content: z.string().nullable() }),
  }),
  z.object({
    kind: z.literal("TaskFailureResult"),
    failure: z.object({ message: z.string() }),
  }),
]);

async function fetchWithDeadline(
  url: URL,
  init: RequestInit,
  deadline: number,
): Promise<Response> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error("timeout");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function parseWithDocling(
  buffer: Buffer,
  filename: string,
  options: ParseWithDoclingOptions = {},
): Promise<DoclingParseOutcome> {
  const baseUrl = options.baseUrl ?? env.DOCLING_SERVICE_URL;
  if (!baseUrl) return { ok: false, reason: "not-configured" };
  const timeoutMs = options.timeoutMs ?? env.DOCLING_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  try {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(buffer)]), filename);
    // RapidOCR (docling-serve's default OCR engine) drops Cyrillic text
    // outright — confirmed on a real scanned Russian document where OCR
    // reported "success" with a "good" confidence grade but kept only
    // Latin-script fragments (titles, ISBNs), silently dropping every
    // Russian sentence. Passing `ocr_lang` here did NOT fix it (byte-for-
    // byte identical output with and without it, tested against the same
    // document) — the bundled RapidOCR model files
    // (ch_ppocr_mobile_v2.0_cls, PP-OCRv6_det/rec, per docling-serve's own
    // startup logs) are Chinese/English recognition models, so this is a
    // model/asset limitation `ocr_lang` can't route around, not a request
    // parameter this client was missing. Left in as a harmless,
    // spec-correct hint in case docling-serve's OCR engine or bundled
    // models change; real Cyrillic support needs a different OCR engine
    // (tesseract/easyocr) configured on docling-serve's side, or MinerU
    // (mineru-client.ts), which advertises explicit Cyrillic support.
    form.append("ocr_lang", "ru");
    form.append("ocr_lang", "en");

    const submitResponse = await fetchWithDeadline(
      new URL("/v1/convert/file/async", baseUrl),
      { method: "POST", body: form },
      deadline,
    );
    if (!submitResponse.ok) {
      return { ok: false, reason: `http-${submitResponse.status}` };
    }
    const submitParsed = taskStatusSchema.safeParse(
      await submitResponse.json(),
    );
    if (!submitParsed.success) {
      return { ok: false, reason: "malformed-response" };
    }

    const { task_id } = submitParsed.data;
    let status = submitParsed.data.task_status;
    while (!TERMINAL_STATUSES.has(status)) {
      const remainingSeconds = (deadline - Date.now()) / 1000;
      if (remainingSeconds <= 0) return { ok: false, reason: "timeout" };

      const pollUrl = new URL(`/v1/status/poll/${task_id}`, baseUrl);
      pollUrl.searchParams.set(
        "wait",
        String(Math.min(POLL_WAIT_SECONDS, remainingSeconds)),
      );
      const pollResponse = await fetchWithDeadline(
        pollUrl,
        { method: "GET" },
        deadline,
      );
      if (!pollResponse.ok) {
        return { ok: false, reason: `http-${pollResponse.status}` };
      }
      const pollParsed = taskStatusSchema.safeParse(await pollResponse.json());
      if (!pollParsed.success) {
        return { ok: false, reason: "malformed-response" };
      }
      status = pollParsed.data.task_status;
    }

    const resultResponse = await fetchWithDeadline(
      new URL(`/v1/result/${task_id}`, baseUrl),
      { method: "GET" },
      deadline,
    );
    if (!resultResponse.ok) {
      return { ok: false, reason: `http-${resultResponse.status}` };
    }
    const resultParsed = resultSchema.safeParse(await resultResponse.json());
    if (!resultParsed.success) {
      return { ok: false, reason: "malformed-response" };
    }
    if ("kind" in resultParsed.data) {
      return { ok: false, reason: resultParsed.data.failure.message };
    }
    if (
      resultParsed.data.status !== "success" &&
      resultParsed.data.status !== "partial_success"
    ) {
      return { ok: false, reason: `status-${resultParsed.data.status}` };
    }

    const text = (resultParsed.data.document.md_content ?? "").trim();
    if (text.length < MIN_TEXT_LENGTH) {
      return { ok: false, reason: "low-quality" };
    }

    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown-error",
    };
  }
}
