/**
 * Laminar tracing for the eval/benchmark CLIs.
 *
 * These are standalone Bun processes (no Next.js instrumentation hook), so
 * each entry point calls `initTelemetry()` once at startup and `flushTelemetry()`
 * before exiting so spans are exported before the process ends.
 * @see https://laminar.sh/docs/tracing/integrations/overview
 */
import { Laminar, registerAiSdkTelemetry } from "@lmnr-ai/lmnr";

let initialized = false;

export function initTelemetry(): void {
  if (initialized || !process.env.LMNR_PROJECT_API_KEY) return;
  Laminar.initialize({ projectApiKey: process.env.LMNR_PROJECT_API_KEY });
  registerAiSdkTelemetry();
  initialized = true;
}

export async function flushTelemetry(): Promise<void> {
  if (!initialized) return;
  await Laminar.flush();
}
