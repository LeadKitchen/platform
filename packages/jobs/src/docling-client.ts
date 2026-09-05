import { env } from "@acme/config";
import { type ParserOutcome, parseWithService } from "./parser-client";

/**
 * Thin client for the standalone Docling microservice
 * (`services/docling-parser`) — structure-aware PDF/DOCX extraction
 * (reading order, tables) that `unpdf`/`mammoth` don't attempt. First tier
 * of the parser cascade; `mineru-client.ts` is the second, tried only when
 * this one fails or reports low quality.
 *
 * See `parser-client.ts` for the shared HTTP contract and failure-handling.
 */

export type DoclingParseOutcome = ParserOutcome;

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
  return parseWithService({
    baseUrl: options.baseUrl ?? env.DOCLING_SERVICE_URL,
    timeoutMs: options.timeoutMs ?? env.DOCLING_TIMEOUT_MS,
    buffer,
    filename,
  });
}
