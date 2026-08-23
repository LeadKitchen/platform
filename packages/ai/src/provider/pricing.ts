import type { LlmUsage } from "./types";

/**
 * USD per million tokens. Kept in one place so cost metrics stay honest.
 *
 * Free-tier candidates are listed explicitly at `{ input: 0, output: 0 }`
 * rather than just being absent — that is what lets {@link hasKnownPricing}
 * tell "confirmed free" apart from "never priced, cost unknown". A reseller
 * gateway model that's simply missing from this table would otherwise report
 * $0.0000 and read as free when the calls were in fact billed.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> =
  {
    "claude-opus-5": { input: 5, output: 25 },
    "claude-opus-4-8": { input: 5, output: 25 },
    "claude-sonnet-5": { input: 3, output: 15 },
    "claude-haiku-4-5": { input: 1, output: 5 },
    "gpt-5.1-all": { input: 1.25, output: 10 },
    "gpt-5.1": { input: 1.25, output: 10 },
    // router.cheap gateway rate, not OpenAI's list price — confirmed with the
    // account owner rather than looked up, since a reseller gateway's price
    // is a private contract, not something inferable from the model name.
    "gpt-5.5": { input: 5, output: 30 },
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "mock-model": { input: 0, output: 0 },
  };

/** Whether a model's price is a confirmed number, not just an absent lookup. */
export function hasKnownPricing(model: string): boolean {
  return model in MODEL_PRICING;
}

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
