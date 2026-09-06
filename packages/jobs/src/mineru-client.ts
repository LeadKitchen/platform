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
 * unpdf/mammoth regardless of the document's content.
 *
 * Uses the async submit-then-poll flow (`POST /tasks` + `GET
 * /tasks/{task_id}` + `GET /tasks/{task_id}/result`), not the synchronous
 * `/file_parse` — confirmed live against a real 72-page scanned PDF that
 * `pipeline`-backend OCR on CPU runs well past what a single held-open
 * HTTP request can safely wait on. Unlike `docling-serve`'s status-poll
 * endpoint, MinerU's `/tasks/{task_id}` has no server-side long-poll
 * (`wait=`) parameter, so this client sleeps `POLL_INTERVAL_MS` between
 * polls itself rather than asking the server to hold the connection open.
 */

export type MinerUParseOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export interface ParseWithMinerUOptions {
  /** Defaults to `env.MINERU_SERVICE_URL`. Overridable so this stays testable without mutating process env. */
  baseUrl?: string;
  /** Defaults to `env.MINERU_TIMEOUT_MS`. Bounds the whole submit+poll+result flow, not any single request. */
  timeoutMs?: number;
  /** Defaults to `POLL_INTERVAL_MS`. Overridable so tests don't sit through real multi-second sleeps. */
  pollIntervalMs?: number;
}

// Below this, treat the extraction as failed rather than indexing a
// near-empty document — e.g. a scanned page's OCR came back blank. MinerU
// doesn't report a page count in this response, so this is an absolute
// floor rather than a per-page average.
const MIN_TEXT_LENGTH = 40;

// How long to sleep between GET /tasks/{task_id} polls. MinerU has no
// server-side long-poll parameter (unlike docling-serve's `wait=`), so
// this is a plain client-side interval — short enough not to feel slow
// once the task finishes, long enough not to hammer the server over what
// can be many minutes of CPU-bound OCR.
const POLL_INTERVAL_MS = 5000;

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

const taskStatusSchema = z.object({
  task_id: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  error: z.string().nullable().optional(),
});

const resultSchema = z.object({
  results: z.record(
    z.string(),
    z.object({ md_content: z.string().optional() }),
  ),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithDeadline(
  url: URL,
  init: RequestInit,
  deadline: number,
): Promise<{ ok: boolean; status: number; body?: unknown }> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error("timeout");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      body: response.ok ? await response.json() : undefined,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseWithMinerU(
  buffer: Buffer,
  filename: string,
  options: ParseWithMinerUOptions = {},
): Promise<MinerUParseOutcome> {
  const baseUrl = options.baseUrl ?? env.MINERU_SERVICE_URL;
  if (!baseUrl) return { ok: false, reason: "not-configured" };
  const timeoutMs = options.timeoutMs ?? env.MINERU_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  try {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(buffer)]), filename);
    // "pipeline" is MinerU's general-purpose, multi-language, CPU-only
    // backend — the right fit for scans in any language, unlike
    // vlm-engine (Chinese/English only) or the *-http-client backends
    // (need a separately hosted OpenAI-compatible model server).
    form.append("backend", "pipeline");
    form.append("parse_method", "auto");
    // Without a language hint, MinerU's pipeline backend still runs but
    // its OCR model defaults elsewhere miss Cyrillic — "east_slavic"
    // covers Russian/Belarusian/Ukrainian, this app's knowledge base.
    form.append("lang_list", "east_slavic");

    const submitResponse = await fetchWithDeadline(
      new URL("/tasks", baseUrl),
      { method: "POST", body: form },
      deadline,
    );
    if (!submitResponse.ok) {
      return { ok: false, reason: `http-${submitResponse.status}` };
    }
    const submitParsed = taskStatusSchema.safeParse(submitResponse.body);
    if (!submitParsed.success) {
      return { ok: false, reason: "malformed-response" };
    }

    const { task_id } = submitParsed.data;
    let status = submitParsed.data.status;
    let error = submitParsed.data.error;
    while (!TERMINAL_STATUSES.has(status)) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return { ok: false, reason: "timeout" };
      await sleep(Math.min(pollIntervalMs, remainingMs));

      const pollResponse = await fetchWithDeadline(
        new URL(`/tasks/${task_id}`, baseUrl),
        { method: "GET" },
        deadline,
      );
      if (!pollResponse.ok) {
        return { ok: false, reason: `http-${pollResponse.status}` };
      }
      const pollParsed = taskStatusSchema.safeParse(pollResponse.body);
      if (!pollParsed.success) {
        return { ok: false, reason: "malformed-response" };
      }
      status = pollParsed.data.status;
      error = pollParsed.data.error;
    }

    if (status === "failed") {
      // Surfaces MinerU's own backend error (e.g. a missing Python
      // dependency for the selected backend) instead of a generic
      // "malformed-response" — this is what made a broken MinerU
      // deployment ("No module named 'six'") diagnosable in the first
      // place.
      return { ok: false, reason: error ?? "task-failed" };
    }

    const resultResponse = await fetchWithDeadline(
      new URL(`/tasks/${task_id}/result`, baseUrl),
      { method: "GET" },
      deadline,
    );
    if (!resultResponse.ok) {
      return { ok: false, reason: `http-${resultResponse.status}` };
    }
    const resultParsed = resultSchema.safeParse(resultResponse.body);
    if (!resultParsed.success) {
      return { ok: false, reason: "malformed-response" };
    }

    const [result] = Object.values(resultParsed.data.results);
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
  }
}
