import { desc, eq, GameDialog, GameEvaluation } from "@acme/db";
import { z } from "zod";

import { facilitatorProcedure } from "../../../orpc";

interface Accumulator {
  variantId: string;
  dialogs: number;
  scoreSum: number;
  styleMatches: number;
  successes: number;
  onTime: number;
  criteriaMet: number;
  criteriaTotal: number;
  latencySum: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function empty(variantId: string): Accumulator {
  return {
    variantId,
    dialogs: 0,
    scoreSum: 0,
    styleMatches: 0,
    successes: 0,
    onTime: 0,
    criteriaMet: 0,
    criteriaTotal: 0,
    latencySum: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Per-variant comparison over real games.
 *
 * This is the production counterpart of the offline harness: the harness tells
 * you whether an approach scores like an expert on labelled fixtures, this
 * tells you what it did to actual sessions — style-match rate, order outcomes,
 * latency and cost. An approach that improves scores but doubles the cost per
 * dialog is a decision, not an automatic win, so both are reported.
 *
 * @example client.admin.game.analytics({ round: 3 })
 */
export const analytics = facilitatorProcedure
  .input(
    z.object({
      round: z.union([z.literal(2), z.literal(3)]).optional(),
      /** Safety valve: aggregation happens in the API process. */
      limit: z.number().int().min(1).max(20000).default(5000),
    }),
  )
  .handler(async ({ context, input }) => {
    // Раунд фильтруется в WHERE, а не после выборки: если сначала выбрать
    // последние `limit` строк без фильтра, а затем отфильтровать по раунду в
    // JS, при перекосе данных между раундами агрегаты считаются по
    // смещённой, нерепрезентативной выборке.
    const rows = await context.db
      .select({
        evaluation: GameEvaluation,
        round: GameDialog.round,
      })
      .from(GameEvaluation)
      .innerJoin(GameDialog, eq(GameDialog.id, GameEvaluation.dialogId))
      .where(
        input.round === undefined
          ? undefined
          : eq(GameDialog.round, input.round),
      )
      .orderBy(desc(GameEvaluation.createdAt))
      .limit(input.limit);

    const byVariant = new Map<string, Accumulator>();

    for (const row of rows) {
      const accumulator =
        byVariant.get(row.evaluation.variantId) ??
        empty(row.evaluation.variantId);

      accumulator.dialogs += 1;
      accumulator.scoreSum += row.evaluation.scorePercent;
      if (row.evaluation.expectedStyle === row.evaluation.actualStyle) {
        accumulator.styleMatches += 1;
      }

      const outcome = row.evaluation.outcome as {
        status?: string;
        onTime?: boolean;
      };
      if (outcome.status === "success") accumulator.successes += 1;
      if (outcome.onTime) accumulator.onTime += 1;

      const criteria = row.evaluation.criteria as { met?: boolean }[];
      accumulator.criteriaTotal += criteria.length;
      accumulator.criteriaMet += criteria.filter((item) => item.met).length;

      accumulator.latencySum += row.evaluation.latencyMs;
      accumulator.inputTokens += row.evaluation.inputTokens;
      accumulator.outputTokens += row.evaluation.outputTokens;
      accumulator.costUsd += row.evaluation.costUsd;

      byVariant.set(row.evaluation.variantId, accumulator);
    }

    const variants = [...byVariant.values()]
      .map((item) => ({
        variantId: item.variantId,
        dialogs: item.dialogs,
        avgScore: round(item.scoreSum / item.dialogs, 1),
        styleMatchRate: round(item.styleMatches / item.dialogs, 3),
        successRate: round(item.successes / item.dialogs, 3),
        onTimeRate: round(item.onTime / item.dialogs, 3),
        criteriaCoverage:
          item.criteriaTotal === 0
            ? 0
            : round(item.criteriaMet / item.criteriaTotal, 3),
        avgLatencyMs: Math.round(item.latencySum / item.dialogs),
        avgCostUsd: round(item.costUsd / item.dialogs, 5),
        totalCostUsd: round(item.costUsd, 4),
        avgTokens: Math.round(
          (item.inputTokens + item.outputTokens) / item.dialogs,
        ),
      }))
      .sort((a, b) => b.dialogs - a.dialogs);

    return {
      dialogs: rows.length,
      round: input.round ?? null,
      variants,
    };
  });
