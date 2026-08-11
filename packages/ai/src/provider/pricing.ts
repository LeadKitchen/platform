import type { LlmUsage } from "./types";

/** USD per million tokens. Kept in one place so cost metrics stay honest. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> =
  {
    "claude-opus-5": { input: 5, output: 25 },
    "claude-opus-4-8": { input: 5, output: 25 },
    "claude-sonnet-5": { input: 3, output: 15 },
    "claude-haiku-4-5": { input: 1, output: 5 },
    "mock-model": { input: 0, output: 0 },
  };

/** Rough USD cost of a call; cached reads are billed at ~10% of input. */
export function estimateCostUsd(model: string, usage: LlmUsage): number {
  const price = MODEL_PRICING[model];
  if (!price) return 0;

  const cachedRead = usage.cacheReadInputTokens ?? 0;
  const cacheWrite = usage.cacheCreationInputTokens ?? 0;

  return (
    (usage.inputTokens * price.input +
      cachedRead * price.input * 0.1 +
      cacheWrite * price.input * 1.25 +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
