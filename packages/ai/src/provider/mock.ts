import type {
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmStreamResult,
} from "./types";

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

    generateStream<T>(request: LlmRequest<T>): LlmStreamResult<T> {
      request.signal?.throwIfAborted();
      const raw = responder(request as LlmRequest<unknown>);
      const value = request.schema.parse(raw) as T;

      const promptChars =
        request.system.length +
        request.messages.reduce(
          (sum, message) => sum + message.content.length,
          0,
        );
      const finalResult: LlmResult<T> = {
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

      // Deterministic stand-in for a real token stream: drip the `reply`
      // field out in a handful of growing slices, then the whole value.
      // Fixtures don't need to model any other field arriving progressively —
      // nothing downstream reads a partial `requests`/`readiness`.
      async function* chunks(): AsyncGenerator<Partial<T>> {
        const reply = (value as { reply?: unknown }).reply;
        if (typeof reply === "string" && reply.length > 0) {
          const step = Math.max(1, Math.ceil(reply.length / 5));
          for (let end = step; end < reply.length; end += step) {
            request.signal?.throwIfAborted();
            yield { reply: reply.slice(0, end) } as unknown as Partial<T>;
          }
        }
        yield value as Partial<T>;
      }

      return { stream: chunks(), result: Promise.resolve(finalResult) };
    },
  };
}
