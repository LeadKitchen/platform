import type { z } from "zod";

/** Reasoning depth passed straight through to `output_config.effort`. */
export type LlmEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest<T> {
  /** Stable identifier of the call site, used for logging and mock routing. */
  purpose: string;
  system: string;
  messages: LlmMessage[];
  /** Structured output contract — the provider must return a parsed value. */
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
  effort?: LlmEffort;
  /** Cancels the underlying model request and every retry/failover attempt. */
  signal?: AbortSignal;
}

export interface LlmResult<T> {
  value: T;
  usage: LlmUsage;
  latencyMs: number;
  model: string;
}

/**
 * A model call whose structured answer is delivered incrementally.
 *
 * `stream` yields the schema's fields as they fill in — shallow partials, safe
 * to render as-is (a growing `reply` string is the case every caller so far
 * cares about). `result` resolves to the same validated value `generate`
 * would have produced, once the model finishes.
 *
 * The two are driven by the same underlying call: `result` only settles once
 * `stream` has been fully consumed (mirrors the Vercel AI SDK's own
 * `streamText`/`streamObject`, which this is built on). A caller that wants
 * the final value must iterate `stream` to completion, even if it has no use
 * for the partial chunks themselves.
 */
export interface LlmStreamResult<T> {
  stream: AsyncIterable<Partial<T>>;
  result: Promise<LlmResult<T>>;
}

/**
 * The single seam between the game engine and any LLM.
 *
 * Strategies never import an SDK directly — they take a provider. That is what
 * lets the offline harness replay whole dialogs deterministically and lets a
 * new approach be benchmarked against the same fixtures.
 */
export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
  /**
   * Same call as `generate`, but the answer streams in instead of arriving
   * all at once — for a caller with a live surface to show partial output on
   * (a chat reply "typing" in), not for background/batch work.
   */
  generateStream<T>(request: LlmRequest<T>): LlmStreamResult<T>;
}

export function emptyUsage(): LlmUsage {
  return { inputTokens: 0, outputTokens: 0 };
}

export function addUsage(...usages: (LlmUsage | undefined)[]): LlmUsage {
  const total = emptyUsage();
  for (const usage of usages) {
    if (!usage) continue;
    total.inputTokens += usage.inputTokens;
    total.outputTokens += usage.outputTokens;
    if (usage.cacheReadInputTokens) {
      total.cacheReadInputTokens =
        (total.cacheReadInputTokens ?? 0) + usage.cacheReadInputTokens;
    }
    if (usage.cacheCreationInputTokens) {
      total.cacheCreationInputTokens =
        (total.cacheCreationInputTokens ?? 0) + usage.cacheCreationInputTokens;
    }
  }
  return total;
}
