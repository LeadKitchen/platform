import { createProviderFromEnv } from "@acme/ai";
import {
  desc,
  eq,
  GameDialog,
  GameEvaluation,
  GameProductEvent,
} from "@acme/db";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

const insightSchema = z.object({
  answer: z.string().min(1).max(2000),
  findings: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        evidence: z.string().min(1).max(600),
        recommendation: z.string().min(1).max(600),
      }),
    )
    .max(6),
  suggestedQuestions: z.array(z.string().min(1).max(200)).max(4),
});

export const analyze = adminProcedure
  .input(z.object({ question: z.string().trim().min(5).max(2000) }))
  .handler(async ({ context, input }) => {
    const [evaluations, events] = await Promise.all([
      context.db
        .select({ evaluation: GameEvaluation, round: GameDialog.round })
        .from(GameEvaluation)
        .innerJoin(GameDialog, eq(GameDialog.id, GameEvaluation.dialogId))
        .orderBy(desc(GameEvaluation.createdAt))
        .limit(1000),
      context.db
        .select({ name: GameProductEvent.name })
        .from(GameProductEvent)
        .orderBy(desc(GameProductEvent.createdAt))
        .limit(10000),
    ]);

    const missingCriteria: Record<string, { title: string; missed: number }> =
      {};
    const rounds: Record<string, { dialogs: number; score: number }> = {};
    for (const row of evaluations) {
      const round = String(row.round);
      const current = rounds[round] ?? { dialogs: 0, score: 0 };
      current.dialogs += 1;
      current.score += row.evaluation.scorePercent;
      rounds[round] = current;
      for (const criterion of row.evaluation.criteria as Array<{
        id: string;
        title: string;
        met: boolean;
      }>) {
        if (criterion.met) continue;
        const item = missingCriteria[criterion.id] ?? {
          title: criterion.title,
          missed: 0,
        };
        item.missed += 1;
        missingCriteria[criterion.id] = item;
      }
    }
    const eventCounts: Record<string, number> = {};
    for (const event of events) {
      eventCounts[event.name] = (eventCounts[event.name] ?? 0) + 1;
    }
    const aggregates = {
      dialogs: evaluations.length,
      rounds: Object.fromEntries(
        Object.entries(rounds).map(([round, value]) => [
          round,
          {
            dialogs: value.dialogs,
            averageScore: Math.round(value.score / value.dialogs),
          },
        ]),
      ),
      mostMissedCriteria: Object.entries(missingCriteria)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.missed - a.missed)
        .slice(0, 10),
      eventCounts,
    };

    const result = await createProviderFromEnv().generate({
      purpose: "admin.analytics.insights",
      schemaName: "AdminAnalyticsInsight",
      schema: insightSchema,
      effort: "medium",
      system: [
        "Ты аналитик учебного симулятора ситуационного руководства.",
        "Отвечай только на основе переданных агрегатов; не придумывай причин, которых данные не подтверждают.",
        "Чётко отделяй наблюдение от гипотезы. Давай проверяемые рекомендации ведущему или методисту.",
        "Не раскрывай персональные данные и не делай выводы о конкретных участниках.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: JSON.stringify({ question: input.question, aggregates }),
        },
      ],
    });
    return { insight: result.value, model: result.model, aggregates };
  });
