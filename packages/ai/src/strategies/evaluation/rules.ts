import {
  classifyDialogStyle,
  detectCriteria,
  detectToxicity,
  scoreDialog,
} from "@acme/game";

import type { EvaluationStrategy } from "../../types";

/**
 * Deterministic scorer: keyword/marker heuristics feed the shared rubric.
 *
 * Zero cost, zero latency, fully reproducible — it is both the fallback when
 * the model is unavailable and the baseline every LLM-based judge has to beat
 * on the labelled fixtures.
 */
export const rulesEvaluation: EvaluationStrategy = {
  id: "rules",
  description:
    "Детерминированная оценка по маркерам речи и правилам методологии, без обращения к модели.",

  async evaluate(request) {
    const startedAt = Date.now();
    const { dialog, expectation } = request;

    const toxicTurns = dialog.turns.filter(
      (turn) => turn.role === "manager" && detectToxicity(turn.text),
    ).length;

    const evaluation = scoreDialog({
      dialog,
      expectation,
      styleDistribution: classifyDialogStyle(dialog.turns),
      metCriteria: detectCriteria(dialog.turns),
      toxicTurns,
    });

    return { evaluation, latencyMs: Date.now() - startedAt };
  },
};
