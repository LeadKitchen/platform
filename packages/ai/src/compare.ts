import type { DialogContext } from "@acme/game";

import { createPipeline, type PipelineDeps, type TurnResult } from "./pipeline";
import type { VariantConfig } from "./variants";

/**
 * One variant's outcome for the same manager utterance on the same dialog.
 *
 * `dialog` is *not* threaded from one variant into the next — every variant
 * runs against the identical input `DialogContext`, so results are directly
 * comparable. Cooperation between families (e.g. ensemble vs retrieval)
 * happens by comparing these results after the fact, not by feeding one
 * variant's output into another's input.
 */
export interface VariantComparisonResult {
  variant: VariantConfig;
  /** Absent when `error` is set — one variant failing does not abort the rest. */
  turn?: TurnResult;
  error?: Error;
}

/**
 * Run several variants — from the same category or across categories — on
 * one manager utterance against the same starting dialog, so their replies,
 * telemetry (cost, latency, knowledge hit count) and metadata can be
 * compared side by side.
 *
 * This is the harness for the "do these approaches work well together"
 * question: pass one variant from each family under test (e.g. a `retrieval`
 * one and an `ensemble` one) and diff the resulting {@link TurnResult}s.
 */
export async function compareVariants(
  variants: VariantConfig[],
  deps: PipelineDeps,
  input: { dialog: DialogContext; utterance: string; signal?: AbortSignal },
): Promise<VariantComparisonResult[]> {
  return Promise.all(
    variants.map(async (variant) => {
      const pipeline = createPipeline(variant, deps);
      try {
        const turn = await pipeline.respond(input);
        return { variant, turn };
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        return { variant, error };
      }
    }),
  );
}
