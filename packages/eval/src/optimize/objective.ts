import type { LlmProvider, VariantConfig } from "@acme/ai";

import type { EvalFixture } from "../fixtures";
import type { ItemResult } from "../metrics";
import { runEvaluation } from "../runner";

/**
 * What an optimiser is allowed to rewrite.
 *
 * Every optimisable prompt lives in `VariantConfig.params`, so an optimised
 * prompt is an ordinary variant — nothing about the pipeline, the API or the
 * analytics has to know optimisation happened.
 */
export type PromptSlotParam =
  | "roleRules"
  | "styleJudgeSystem"
  | "criteriaJudgeSystem";

/**
 * Objective every optimiser maximises, per scenario.
 *
 * Combines the two things a good arm has to do at once — agree with the expert
 * and keep the character in role — so the optimiser cannot buy accuracy by
 * turning the cook into an analyst.
 *
 * This lives outside any one optimiser on purpose: GEPA and the Ax few-shot
 * bootstrapper are meant to be *compared*, and a comparison where each side
 * maximises its own definition of "better" answers nothing.
 */
export function objective(item: ItemResult): number {
  const accuracy = 1 - Math.min(1, item.absError / 100);
  const styleMatch = item.actualStyleCorrect ? 1 : 0;
  const roleplay = item.personaViolations.length === 0 ? 1 : 0;
  const drift = 1 - Math.min(1, item.personaDrift.rate);
  return 0.4 * accuracy + 0.3 * styleMatch + 0.2 * roleplay + 0.1 * drift;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface ScoreCandidateOptions {
  /** Which variant parameter the candidate text is injected into. */
  param: PromptSlotParam;
  text: string;
  /** Variant the candidate runs the pipeline as. */
  baseVariant: VariantConfig;
  provider: LlmProvider;
  fixtures: EvalFixture[];
  concurrency?: number;
  /**
   * Suffix for the throwaway variant id.
   *
   * Variant ids are capped at 64 characters by `variantConfigSchema`, so the
   * label is trimmed rather than trusted.
   */
  label?: string;
}

/**
 * Run one candidate prompt through the full harness and score it per scenario.
 *
 * Deliberately the *whole* pipeline, not just the stage being optimised: a
 * judge prompt that classifies style beautifully in isolation but disagrees
 * with the deterministic rubric it feeds is not an improvement, and only an
 * end-to-end run can see that.
 */
export async function scoreCandidate(
  options: ScoreCandidateOptions,
): Promise<Map<string, number>> {
  const suffix = `__${options.label ?? "candidate"}`;
  const variantId = `${options.baseVariant.id.slice(0, 64 - suffix.length)}${suffix}`;

  const variant: VariantConfig = {
    ...options.baseVariant,
    id: variantId,
    params: { ...options.baseVariant.params, [options.param]: options.text },
  };

  const result = await runEvaluation({
    variantIds: [variant.id],
    variants: [variant],
    provider: options.provider,
    fixtures: options.fixtures,
    concurrency: options.concurrency ?? 4,
  });

  const scores = new Map<string, number>();
  for (const item of result.items) scores.set(item.fixtureId, objective(item));
  return scores;
}
