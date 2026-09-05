/**
 * Next.js instrumentation hook.
 *
 * Registers OpenTelemetry so traces/metrics are emitted automatically. On
 * Vercel this is picked up by the platform; self-hosted setups can point
 * `OTEL_EXPORTER_OTLP_ENDPOINT` at any OTLP-compatible collector.
 *
 * @see https://nextjs.org/docs/app/guides/open-telemetry
 *
 * Laminar is initialized separately (dual pipeline) so LLM/agent traces from
 * `@acme/ai` show up in the Laminar UI without interfering with the general
 * `@vercel/otel` pipeline above.
 * @see https://laminar.sh/docs/tracing/integrations/overview
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { Laminar, registerAiSdkTelemetry } = await import("@lmnr-ai/lmnr");
    Laminar.initialize({ projectApiKey: process.env.LMNR_PROJECT_API_KEY });
    registerAiSdkTelemetry();
  }
}
