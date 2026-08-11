import type { RunResult } from "./runner";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Human-readable comparison of the approaches.
 *
 * The headline metric is score MAE against the expert labels — a variant that
 * is fast, cheap and confidently wrong is worse than a slow one that agrees
 * with the facilitator.
 */
export function renderMarkdownReport(result: RunResult): string {
  const lines: string[] = [];

  lines.push("# Сравнение подходов ИИ-модуля", "");
  lines.push(
    `- Провайдер: \`${result.providerId}\` (модель \`${result.model}\`)`,
    `- Сценариев: ${result.fixtures}, эпох: ${result.epochs}`,
    `- Запуск: ${result.startedAt} → ${result.finishedAt}`,
    "",
  );

  if (result.providerId !== "anthropic") {
    lines.push(
      "> ⚠️ Прогон выполнен без обращения к модели. Это дымовой тест конвейера:",
      "> арм-варианты с LLM-судьёй здесь совпадают с правилами по построению.",
      "> Для содержательного сравнения запустите с `--provider anthropic`.",
      "",
    );
  }

  lines.push("## Итог по вариантам", "");
  lines.push(
    "| Вариант | MAE к эксперту | Ожидаемый стиль | Фактический стиль | F1 по критериям | Роль выдержана | Молчание до обращения | Ср. задержка | Токены (in/out) | Стоимость |",
  );
  lines.push(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );

  const ranked = [...result.variants].sort((a, b) => a.scoreMae - b.scoreMae);
  for (const variant of ranked) {
    lines.push(
      `| \`${variant.variantId}\` | ${variant.scoreMae.toFixed(1)} | ${percent(
        variant.expectedStyleAccuracy,
      )} | ${percent(variant.actualStyleAccuracy)} | ${variant.criteriaF1.toFixed(
        2,
      )} | ${percent(variant.personaAdherence)} | ${percent(
        variant.silenceAccuracy,
      )} | ${variant.avgLatencyMs} мс | ${variant.totalInputTokens}/${
        variant.totalOutputTokens
      } | $${variant.totalCostUsd.toFixed(4)} |`,
    );
  }
  lines.push("");

  const best = ranked[0];
  const baseline = result.variants.find(
    (variant) => variant.variantId === "baseline",
  );
  if (best && baseline && best.variantId !== baseline.variantId) {
    const delta = baseline.scoreMae - best.scoreMae;
    lines.push(
      delta > 0
        ? `**Лучший вариант — \`${best.variantId}\`**: MAE ниже baseline на ${delta.toFixed(1)} пункта.`
        : `**Baseline не побит**: ни один вариант не улучшил MAE (\`${best.variantId}\` — ${best.scoreMae.toFixed(1)} против ${baseline.scoreMae.toFixed(1)}).`,
      "",
    );
  }

  if (result.epochs > 1) {
    lines.push("## Кривая обучения (MAE по эпохам)", "");
    lines.push(
      `| Вариант | ${result.epochSummaries.map((epoch) => `эпоха ${epoch.epoch}`).join(" | ")} |`,
    );
    lines.push(
      `| --- | ${result.epochSummaries.map(() => "---:").join(" | ")} |`,
    );
    for (const variant of result.variants) {
      const cells = result.epochSummaries.map((epoch) => {
        const summary = epoch.variants.find(
          (item) => item.variantId === variant.variantId,
        );
        return summary ? summary.scoreMae.toFixed(1) : "—";
      });
      lines.push(`| \`${variant.variantId}\` | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## Худшие расхождения", "");
  lines.push(
    "| Сценарий | Вариант | Авто | Эксперт | Δ | Стиль (авто → метка) |",
  );
  lines.push("| --- | --- | ---: | ---: | ---: | --- |");

  const worst = [...result.items]
    .filter((item) => item.epoch === result.epochs)
    .sort((a, b) => b.absError - a.absError)
    .slice(0, 10);

  for (const item of worst) {
    lines.push(
      `| ${item.fixtureId} | \`${item.variantId}\` | ${item.score} | ${item.expertScore} | ${item.absError} | ${item.actualStyle} → ${item.labelActualStyle} |`,
    );
  }
  lines.push("");

  const violations = result.items.filter(
    (item) => item.personaViolations.length > 0,
  );
  if (violations.length > 0) {
    lines.push("## Нарушения роли", "");
    for (const item of violations.slice(0, 20)) {
      lines.push(
        `- \`${item.variantId}\` / ${item.fixtureId}: ${item.personaViolations.join(", ")}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
