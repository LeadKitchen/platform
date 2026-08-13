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
