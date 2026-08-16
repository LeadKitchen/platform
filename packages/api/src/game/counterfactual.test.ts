import { describe, expect, it } from "bun:test";
import type { Evaluation } from "@acme/game";

import { compareEvaluations, sameUtterance } from "./counterfactual";

function evaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    scorePercent: 55,
    expectedStyle: "coaching",
    actualStyle: "directive",
    styleDistribution: {
      directive: 1,
      coaching: 0,
      supporting: 0,
      delegating: 0,
    },
    criteria: [
      {
        id: "clarify_task",
        title: "Объяснить ожидаемый результат",
        weight: 2,
        met: true,
      },
      {
        id: "check_understanding",
        title: "Проверить понимание",
        weight: 2,
        met: false,
      },
    ],
    outcome: {
      status: "partial",
      onTime: false,
      defects: ["задержка"],
      motivationDelta: -1,
      summary: "Заказ задержан.",
    },
    breakdown: { style: 20, actions: 15, outcome: 10, penalties: 0 },
    summary: "Есть точки роста.",
    ...overrides,
  };
}

describe("counterfactual comparison", () => {
  it("detects newly met criteria and business outcome changes", () => {
    const projected = evaluation({
      scorePercent: 82,
      actualStyle: "coaching",
      criteria: [
        {
          id: "clarify_task",
          title: "Объяснить ожидаемый результат",
          weight: 2,
          met: true,
        },
        {
          id: "check_understanding",
          title: "Проверить понимание",
          weight: 2,
          met: true,
        },
      ],
      outcome: {
        status: "success",
        onTime: true,
        defects: [],
        motivationDelta: 1,
        summary: "Заказ выполнен в срок.",
      },
    });

    const comparison = compareEvaluations(evaluation(), projected);

    expect(comparison.verdict).toBe("improved");
    expect(comparison.scoreDelta).toBe(27);
    expect(comparison.newlyMet).toEqual([
      { id: "check_understanding", title: "Проверить понимание" },
    ]);
    expect(comparison.styleChanged).toBe(true);
    expect(comparison.outcomeChanged).toBe(true);
  });

  it("normalizes whitespace and case before comparing utterances", () => {
    expect(sameUtterance("  Анна,   начните сейчас ", "анна, начните сейчас")).toBe(
      true,
    );
    expect(sameUtterance("Начните сейчас", "Как вы поняли задачу?")).toBe(
      false,
    );
  });
});
