import { describe, expect, test } from "bun:test";

import { FIXTURES } from "./fixtures";
import { checkPersonaAdherence, setScore } from "./metrics";
import { renderMarkdownReport } from "./report";
import { runEvaluation } from "./runner";
import { createSimulatedProvider } from "./simulated-provider";

describe("metrics", () => {
  test("setScore is exact on a perfect match", () => {
    const score = setScore(
      ["clarify_task", "set_deadline"],
      ["clarify_task", "set_deadline"],
    );
    expect(score.f1).toBe(1);
  });

  test("setScore penalises both misses and false positives", () => {
    const score = setScore(
      ["clarify_task", "motivate"],
      ["clarify_task", "set_deadline"],
    );
    expect(score.precision).toBe(0.5);
    expect(score.recall).toBe(0.5);
  });

  test("naming the methodology counts as breaking character", () => {
    const violations = checkPersonaAdherence([
      { role: "employee", text: "Вам стоило выбрать директивный стиль." },
    ]);
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe("runEvaluation", () => {
  test("replays the fixtures and produces comparable summaries", async () => {
    const result = await runEvaluation({
      variantIds: ["baseline", "rag", "graph-rag"],
      provider: createSimulatedProvider(),
    });

    expect(result.items).toHaveLength(3 * FIXTURES.length);
    expect(result.variants).toHaveLength(3);

    for (const variant of result.variants) {
      // The rules engine drives the expected style for every variant, so it
      // must agree with the methodology labels regardless of the approach.
      expect(variant.expectedStyleAccuracy).toBe(1);
      expect(variant.silenceAccuracy).toBe(1);
      expect(variant.personaAdherence).toBe(1);
      expect(variant.scoreMae).toBeLessThan(25);
    }
  });

  test("the report highlights the ranking and flags offline runs", async () => {
    const result = await runEvaluation({
      variantIds: ["baseline", "rag"],
      provider: createSimulatedProvider(),
    });
    const report = renderMarkdownReport(result);

    expect(report).toContain("Сравнение подходов");
    expect(report).toContain("baseline");
    expect(report).toContain("--provider anthropic");
  });

  test("learning changes the skill policy across epochs", async () => {
    const result = await runEvaluation({
      variantIds: ["skill-rl"],
      provider: createSimulatedProvider(),
      epochs: 2,
      learn: true,
    });

    expect(result.epochSummaries).toHaveLength(2);
    expect(result.items.filter((item) => item.epoch === 2).length).toBe(
      FIXTURES.length,
    );
  });
});
