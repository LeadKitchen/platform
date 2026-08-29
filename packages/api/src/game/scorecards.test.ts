import { describe, expect, test } from "bun:test";
import type { GameScorecardSnapshot } from "@acme/db";
import { CRITERION_IDS } from "@acme/game";
import { SCORECARD_TEMPLATES, scorecardCriteria } from "./scorecards";

describe("scorecards", () => {
  test("templates contain valid, unique criteria and balanced categories", () => {
    const validIds = new Set<string>(CRITERION_IDS);

    for (const template of SCORECARD_TEMPLATES) {
      expect(
        template.categories.reduce((sum, category) => sum + category.weight, 0),
      ).toBe(100);
      const ids = template.categories.flatMap((category) =>
        category.criteria.map((criterion) => criterion.criterionId),
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => validIds.has(id))).toBe(true);
    }
  });

  test("session snapshot is flattened into evaluator criteria", () => {
    const snapshot: GameScorecardSnapshot = {
      id: "09f69f2d-1b00-4b83-ad00-6d278e557914",
      name: "Test",
      description: "",
      categories: SCORECARD_TEMPLATES[0]?.categories ?? [],
    };

    const criteria = scorecardCriteria(snapshot);
    expect(criteria.length).toBe(5);
    expect(criteria[0]).toMatchObject({
      id: "clarify_task",
      title: "Чётко поставил задачу (что именно и сколько)",
    });
    expect(
      criteria.reduce((sum, criterion) => sum + criterion.weight, 0),
    ).toBeCloseTo(100);
  });
});
