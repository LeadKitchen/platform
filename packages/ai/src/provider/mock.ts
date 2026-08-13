import type { LlmProvider, LlmRequest, LlmResult } from "./types";

export type MockResponder = (request: LlmRequest<unknown>) => unknown;

export interface MockProviderOptions {
  id?: string;
  model?: string;
  /** Simulated latency, so timing metrics stay comparable in tests. */
  latencyMs?: number;
  /** Rough token accounting used by the offline harness. */
  tokensPerChar?: number;
}

/**
 * Deterministic provider used by unit tests and by offline replays in
 * `@acme/eval`. The responder gets the full request (including `purpose`), so
 * a fixture can answer differently per call site.
 *
 * The returned value is validated against the request schema exactly like a
 * real structured-output call, which means a fixture that drifts away from the
 * contract fails loudly instead of silently skewing a benchmark.
 */
export function createMockProvider(
  responder: MockResponder,
  options: MockProviderOptions = {},
): LlmProvider {
  const tokensPerChar = options.tokensPerChar ?? 0.25;

  return {
    id: options.id ?? "mock",
    model: options.model ?? "mock-model",
    async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      request.signal?.throwIfAborted();
      const raw = responder(request as LlmRequest<unknown>);
      const value = request.schema.parse(raw);
      request.signal?.throwIfAborted();

      const promptChars =
        request.system.length +
        request.messages.reduce(
          (sum, message) => sum + message.content.length,
          0,
        );

      return {
        value,
        usage: {
          inputTokens: Math.round(promptChars * tokensPerChar),
          outputTokens: Math.round(
            JSON.stringify(value).length * tokensPerChar,
          ),
        },
        latencyMs: options.latencyMs ?? 0,
        model: options.model ?? "mock-model",
      };
    },
  };
}
