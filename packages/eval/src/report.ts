import type { MetricComparison, RunResult } from "./runner";
import { kappaLabel } from "./statistics";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/**
 * Verdict for one metric of one arm.
 *
 * The wording is deliberately blunt: on a few dozen scenarios most honest
 * results are "не доказано", and a report that dresses those up as wins is
 * worse than no report — it is what makes a customer fund the wrong approach.
 */
function verdict(comparison: MetricComparison): string {
  if (comparison.pairs === 0) return "нет данных";
  if (!comparison.significant) return "не доказано";
  return comparison.delta > 0 ? "**лучше**" : "**хуже**";
}

export function renderMarkdownReport(result: RunResult): string {
  const lines: string[] = [];

  lines.push("# Сравнение подходов ИИ-модуля", "");
  lines.push(
    `- Провайдер: \`${result.providerId}\` (модель \`${result.model}\`)`,
    `- Сценариев: ${result.fixtures}, прогонов на сценарий: ${result.runsPerFixture}, эпох: ${result.epochs}`,
    `- Контрольный вариант: \`${result.referenceVariantId}\``,
    `- Запуск: ${result.startedAt} → ${result.finishedAt}`,
    "",
  );

  if (result.providerId === "simulated") {
    lines.push(
      "> ⚠️ Прогон выполнен без обращения к модели. Это дымовой тест конвейера:",
      "> арм-варианты с LLM-судьёй здесь совпадают с правилами по построению.",
      "> Для содержательного сравнения запустите с реальным провайдером.",
      "",
    );
  }

  if (result.expertLabelledFixtures < result.fixtures) {
    const provisional = result.fixtures - result.expertLabelledFixtures;
    lines.push(
      `> ⚠️ Экспертными метками подписано ${result.expertLabelledFixtures} из ${result.fixtures} сценариев,`,
      `> остальные ${provisional} — предварительные. Колонка «MAE к эксперту» показывает`,
      "> расхождение с временной калибровкой, а не с методологом: она годится, чтобы",
      "> ловить регрессии, и не годится как основание внедрять подход.",
      "",
    );
  }

  const totalPairs = result.comparisons[0]?.metrics[0]?.pairs ?? 0;
  if (totalPairs > 0 && totalPairs < 30) {
    lines.push(
      `> ⚠️ Всего ${totalPairs} парных наблюдений. Этого мало: доверительные интервалы`,
      "> будут широкими, и почти любой результат окажется статистически недоказанным.",
      "> Для решения о внедрении нужно 60+ размеченных сценариев.",
      "",
    );
  }

  lines.push("## Значимость против контрольного варианта", "");
  lines.push(
    "Парный бутстрап по сценариям, 95% доверительный интервал.",
    "Положительная Δ — вариант лучше контрольного. Вывод «лучше» только если интервал не пересекает ноль.",
    "",
  );

  for (const comparison of result.comparisons) {
    lines.push(`### \`${comparison.variantId}\``, "");
    lines.push("| Метрика | Δ | 95% ДИ | p | Вывод |");
    lines.push("| --- | ---: | :---: | ---: | --- |");
    for (const metric of comparison.metrics) {
      const digits = metric.metric === "costUsd" ? 4 : 2;
      lines.push(
        `| ${metric.label} | ${signed(metric.delta, digits)} | [${metric.ciLow.toFixed(digits)}; ${metric.ciHigh.toFixed(digits)}] | ${metric.pValue.toFixed(3)} | ${verdict(metric)} |`,
      );
    }
    lines.push("");
  }

  if (result.comparisons.length > 0) {
    const wins = result.comparisons.filter((comparison) =>
      comparison.metrics.some(
        (metric) =>
          metric.metric === "scoreMae" &&
          metric.significant &&
          metric.delta > 0,
      ),
    );
    lines.push(
      wins.length === 0
        ? `**Ни один вариант не показал доказанного улучшения точности оценки против \`${result.referenceVariantId}\`.**`
        : `**Доказанное улучшение MAE:** ${wins.map((item) => `\`${item.variantId}\``).join(", ")}.`,
      "",
    );
  }

  lines.push("## Сырые показатели", "");
  lines.push(
    "| Вариант | MAE | σ внутри сценария | κ по стилю | F1 критериев | Роль | Дрейф | Молчание | Задержка | $/диалог |",
  );
  lines.push(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );

  const ranked = [...result.variants].sort((a, b) => a.scoreMae - b.scoreMae);
  for (const variant of ranked) {
    lines.push(
      `| \`${variant.variantId}\` | ${variant.scoreMae.toFixed(1)} | ${variant.scoreStdDev.toFixed(1)} | ${variant.styleKappa.toFixed(2)} | ${variant.criteriaF1.toFixed(2)} | ${percent(variant.personaAdherence)} | ${percent(variant.personaDriftRate)} | ${percent(variant.silenceAccuracy)} | ${variant.avgLatencyMs} мс | $${variant.avgCostUsd.toFixed(4)} |`,
    );
  }
  lines.push("");

  const reference = result.variants.find(
    (variant) => variant.variantId === result.referenceVariantId,
  );
  if (reference) {
    lines.push(
      `Согласие со стилем эксперта у контрольного варианта: κ = ${reference.styleKappa.toFixed(2)} (${kappaLabel(reference.styleKappa)}).`,
      "",
    );
  }

  if (result.runsPerFixture === 1) {
    lines.push(
      "> Прогон один на сценарий, поэтому колонка «σ внутри сценария» пуста.",
      "> Запустите с `--runs 3`, чтобы отделить реальный эффект от разброса модели.",
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

  if (result.failures.length > 0) {
    const byVariant = new Map<string, number>();
    for (const failure of result.failures) {
      byVariant.set(
        failure.variantId,
        (byVariant.get(failure.variantId) ?? 0) + 1,
      );
    }

    lines.push("## Несостоявшиеся сценарии", "");
    lines.push(
      "Эти диалоги не доехали до оценки и исключены из всех метрик выше.",
      "Если сбоев много и они распределены неравномерно, сравнение вариантов",
      "смещено: вариант мог «выиграть», уронив именно трудные сценарии.",
      "",
    );
    for (const [variantId, count] of [...byVariant].sort(
      (a, b) => b[1] - a[1],
    )) {
      lines.push(`- \`${variantId}\`: ${count}`);
    }
    lines.push("");
    for (const failure of result.failures.slice(0, 5)) {
      lines.push(
        `  - ${failure.fixtureId}: ${failure.message.split("\n")[0] ?? ""}`,
      );
    }
    lines.push("");
  }

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
