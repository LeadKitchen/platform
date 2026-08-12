import { describe, expect, test } from "bun:test";

import { FIXTURES } from "./fixtures";
import {
  checkPersonaAdherence,
  measurePersonaDrift,
  setScore,
} from "./metrics";
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

describe("measurePersonaDrift", () => {
  test("a cook who stays a cook does not drift", () => {
    const drift = measurePersonaDrift([
      { role: "manager", text: "Анна, возьмёшь пироги?" },
      { role: "employee", text: "Возьму, к шести сделаю." },
      { role: "employee", text: "Тесто уже поставила." },
    ]);

    expect(drift.rate).toBe(0);
    expect(drift.slope).toBe(0);
  });

  test("slipping into assistant register is detected", () => {
    const drift = measurePersonaDrift([
      { role: "employee", text: "Возьму, сделаю к шести." },
      {
        role: "employee",
        text: "Вот несколько вариантов оформления:\n- классический\n- ягодный",
      },
    ]);

    expect(drift.rate).toBeGreaterThan(0);
  });

  test("slope is positive when the character slips only later", () => {
    const drift = measurePersonaDrift([
      { role: "employee", text: "Поняла, делаю." },
      { role: "employee", text: "Уже ставлю в печь." },
      { role: "employee", text: "Надеюсь, это помогло! Чем ещё могу помочь?" },
    ]);

    expect(drift.slope).toBeGreaterThan(0);
  });

  test("manager turns are ignored", () => {
    const drift = measurePersonaDrift([
      { role: "manager", text: "Вот несколько вариантов: чем ещё могу помочь" },
      { role: "employee", text: "Поняла, сделаю." },
    ]);

    expect(drift.rate).toBe(0);
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
    expect(report).toContain("с реальным провайдером");
  });

  test("the report refuses to call an unproven difference a win", async () => {
    const result = await runEvaluation({
      variantIds: ["baseline", "rag"],
      provider: createSimulatedProvider(),
      fixtures: FIXTURES.slice(0, 6),
    });
    const report = renderMarkdownReport(result);

    // Six fixtures cannot support a conclusion — the report has to say so
    // instead of ranking the arms and implying a winner.
    expect(report).toContain("парных наблюдений");
    expect(report).toContain("не доказано");
  });

  test("repeated runs expose the model's own variance", async () => {
    const result = await runEvaluation({
      variantIds: ["baseline"],
      provider: createSimulatedProvider(),
      fixtures: FIXTURES.slice(0, 3),
      runsPerFixture: 2,
    });

    expect(result.runsPerFixture).toBe(2);
    expect(result.items).toHaveLength(6);
    expect(result.items.filter((item) => item.run === 2)).toHaveLength(3);
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

describe("отчёт не выдаёт отсутствие данных за результат", () => {
  test("вариант без единого диалога не встаёт первым с MAE 0", async () => {
    const result = await runEvaluation({
      variantIds: ["baseline"],
      provider: createSimulatedProvider(),
      fixtures: FIXTURES.slice(0, 3),
    });

    // Подмешиваем арм, у которого не получилось ни одного диалога: без
    // отдельной обработки его scoreMae === 0 отсортировался бы на первое
    // место и прочитался бы как идеальная точность.
    const broken = {
      ...result.variants[0],
      variantId: "broken",
      items: 0,
      scoreMae: 0,
    } as (typeof result.variants)[number];

    const report = renderMarkdownReport({
      ...result,
      variants: [...result.variants, broken],
      failures: [
        {
          fixtureId: "x",
          variantId: "broken",
          message: "предвычет квоты не прошёл, остаток $0.001",
        },
      ],
    });

    const table = report.slice(report.indexOf("## Сырые"));
    expect(table.indexOf("`broken`")).toBeGreaterThan(
      table.indexOf("`baseline`"),
    );
    expect(report).toContain("нет данных");
    expect(report).toContain("Ни одного успешного диалога");
    expect(report).toContain("внешние отказы провайдера");
  });
});

describe("подмена модели не должна проходить незамеченной", () => {
  test("отчёт предупреждает, когда армы обслужены разными моделями", async () => {
    const result = await runEvaluation({
      variantIds: ["baseline"],
      provider: createSimulatedProvider(),
      fixtures: FIXTURES.slice(0, 3),
    });

    // Пул переключился на другую модель на середине прогона: числа получены,
    // но сравнивать такие армы между собой нельзя — разница может объясняться
    // моделью, а не подходом.
    const swapped = {
      ...result.variants[0],
      variantId: "rag",
      modelMix: { "модель-A": 2, "модель-B": 1 },
    } as (typeof result.variants)[number];

    const report = renderMarkdownReport({
      ...result,
      variants: [...result.variants, swapped],
    });

    expect(report).toContain("обслужены разными моделями");
    expect(report).toContain("модель-A");
    expect(report).toContain("модель-B");
  });

  test("однородный прогон не поднимает ложную тревогу", async () => {
    const result = await runEvaluation({
      variantIds: ["baseline"],
      provider: createSimulatedProvider(),
      fixtures: FIXTURES.slice(0, 3),
    });

    expect(renderMarkdownReport(result)).not.toContain(
      "обслужены разными моделями",
    );
  });
});
