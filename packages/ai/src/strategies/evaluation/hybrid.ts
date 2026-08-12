import {
  type CriterionId,
  classifyDialogStyle,
  detectCriteria,
  detectToxicity,
  emptyStyleDistribution,
  MANAGEMENT_STYLES,
  type StyleDistribution,
  scoreDialog,
} from "@acme/game";

import { addUsage } from "../../provider/types";
import type { EvaluationStrategy } from "../../types";
import { judgeCriteria, judgeStyle } from "./llm-judge";

function blend(
  heuristic: StyleDistribution,
  llm: StyleDistribution,
  llmWeight: number,
): StyleDistribution {
  const blended = emptyStyleDistribution();
  for (const style of MANAGEMENT_STYLES) {
    blended[style] =
      (1 - llmWeight) * heuristic[style] + llmWeight * (llm[style] ?? 0);
  }
  return blended;
}

/**
 * Hybrid scorer: heuristics as a prior, the model as the arbiter.
 *
 * The style mix is a weighted blend (the markers are precise but blunt; the
 * model catches paraphrase). For criteria the model's verdict wins where it
 * gave one, and the heuristic fills any criterion the model skipped — so a
 * truncated model answer degrades to the deterministic baseline instead of
 * silently scoring the manager as having done nothing.
 */
export const hybridEvaluation: EvaluationStrategy = {
  id: "hybrid",
  description:
    "Смешанная оценка: эвристики как приоритет-подсказка, модель как арбитр; при сбое модели откат на правила.",

  async evaluate(request, deps) {
    const startedAt = Date.now();
    const { dialog, expectation } = request;

    const llmWeight =
      typeof deps.params.llmWeight === "number" ? deps.params.llmWeight : 0.7;

    const heuristicStyle = classifyDialogStyle(dialog.turns);
    const heuristicMet = detectCriteria(dialog.turns);
    const heuristicToxic = dialog.turns.filter(
      (turn) => turn.role === "manager" && detectToxicity(turn.text),
    ).length;

    const [style, criteria] = await Promise.all([
      judgeStyle(dialog, deps),
      judgeCriteria(dialog, expectation, deps),
    ]);

    const met = new Set<CriterionId>();
    for (const criterion of expectation.requiredCriteria) {
      const judged = criterion.id in criteria.comments;
      if (judged) {
        if (criteria.met.has(criterion.id)) met.add(criterion.id);
      } else if (heuristicMet.has(criterion.id)) {
        met.add(criterion.id);
      }
    }

    const evaluation = scoreDialog({
      dialog,
      expectation,
      styleDistribution: blend(heuristicStyle, style.distribution, llmWeight),
      metCriteria: met,
      toxicTurns: Math.max(heuristicToxic, criteria.toxicTurns),
      criterionComments: criteria.comments,
    });

    return {
      evaluation,
      usage: addUsage(style.usage, criteria.usage),
      latencyMs: Date.now() - startedAt,
      meta: { llmWeight, evidence: style.evidence, model: style.model },
    };
  },
};
