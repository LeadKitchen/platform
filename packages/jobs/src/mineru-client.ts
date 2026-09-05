import { env } from "@acme/config";
import { type ParserOutcome, parseWithService } from "./parser-client";

/**
 * Thin client for the standalone MinerU microservice
 * (`services/mineru-parser`) — second tier of the parser cascade, tried
 * only after `docling-client.ts` fails or reports low quality. MinerU's
 * pipeline is heavier (CPU-bound OCR/layout, minutes rather than seconds)
 * and reserved for the scanned/problem pages Docling struggles with.
 *
 * See `parser-client.ts` for the shared HTTP contract and failure-handling.
 */

export type MinerUParseOutcome = ParserOutcome;

export interface ParseWithMinerUOptions {
  /** Defaults to `env.MINERU_SERVICE_URL`. Overridable so this stays testable without mutating process env. */
  baseUrl?: string;
  /** Defaults to `env.MINERU_TIMEOUT_MS`. */
  timeoutMs?: number;
}

export async function parseWithMinerU(
  buffer: Buffer,
  filename: string,
  options: ParseWithMinerUOptions = {},
): Promise<MinerUParseOutcome> {
  return parseWithService({
    baseUrl: options.baseUrl ?? env.MINERU_SERVICE_URL,
    timeoutMs: options.timeoutMs ?? env.MINERU_TIMEOUT_MS,
    buffer,
    filename,
  });
}
