import { FIXTURES } from "./fixtures";
import type { ItemResult } from "./metrics";
import type { MetricComparison, RunResult, VariantComparison } from "./runner";
import { kappaLabel } from "./statistics";

const FIXTURE_BY_ID = new Map(FIXTURES.map((fixture) => [fixture.id, fixture]));

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Footnote marker to append to a metric's label in the significance table. */
const METRIC_FOOTNOTES: Record<string, string> = {
  scoreMae: "[^mae]",
  criteriaF1: "[^f1]",
  personaAdherence: "[^role]",
  personaDriftRate: "[^drift]",
  costUsd: "[^cost]",
};

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

/**
 * One-line recommendation for a variant, driven by the same significance
 * call as `verdict()` on its primary metric (MAE to the expert) — never a
 * separate judgment, so the prose can't disagree with the table above it.
 */
function recommendation(comparison: VariantComparison): string {
  const primary = comparison.metrics.find(
    (metric) => metric.metric === "scoreMae",
  );
  if (!primary || primary.pairs === 0) {
    return "**Рекомендация:** данных недостаточно.";
  }
  if (!primary.significant) {
    return "**Рекомендация:** не доказано — разница в точности статистически не подтверждена, внедрять рано.";
  }
  return primary.delta > 0
    ? "**Рекомендация:** переходить — доказанное улучшение точности против контрольного варианта."
    : "**Рекомендация:** не переходить — точность значимо хуже контрольного варианта.";
}

/** Best- or worst-matching dialog for a variant, among items with a saved transcript. */
function pickExample(
  items: ItemResult[],
  variantId: string,
  order: "best" | "worst",
): ItemResult | undefined {
  const candidates = items.filter(
    (item) =>
      item.variantId === variantId && item.turns && item.turns.length > 0,
  );
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) =>
    order === "worst" ? b.absError - a.absError : a.absError - b.absError,
  )[0];
}

function renderExample(item: ItemResult): string[] {
  const fixture = FIXTURE_BY_ID.get(item.fixtureId);
  const lines: string[] = [
    `_${fixture?.description ?? item.fixtureId}_ — автооценка ${item.score}, эксперт ${item.expertScore} (Δ ${item.score - item.expertScore})`,
    "",
  ];
  for (const turn of item.turns ?? []) {
    const speaker = turn.role === "manager" ? "Менеджер" : "Сотрудник";
    lines.push(`> **${speaker}:** ${turn.text.replace(/\n/g, " ")}`);
  }
  lines.push("");
  if (item.summary) {
    lines.push(`**Вывод модели:** ${item.summary}`, "");
  }
  return lines;
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
    const provisional =
      result.fixtures -
      result.expertLabelledFixtures -
      result.aiAssistedFixtures;
    const aiNote =
      result.aiAssistedFixtures > 0
        ? ` (из них ${result.aiAssistedFixtures} — черновая разметка модели, ещё не проверена методологом)`
        : "";
    lines.push(
      `> ⚠️ Экспертными метками подписано ${result.expertLabelledFixtures} из ${result.fixtures} сценариев,`,
      `> остальные ${provisional + result.aiAssistedFixtures} — предварительные${aiNote}.`,
      "> Колонка «MAE[^mae] к эксперту» показывает расхождение с временной калибровкой,",
      "> а не с методологом: она годится, чтобы ловить регрессии, и не годится как",
      "> основание внедрять подход.",
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

  // Failover keeps a run alive, but it can also swap the model under an arm.
  // Comparing an arm served by one model against an arm served by another is
  // not an experiment, so this is a hard warning rather than a footnote.
  const mixedArms = result.variants.filter(
    (variant) => Object.keys(variant.modelMix).length > 1,
  );
  const servedModels = new Set(
    result.variants.flatMap((variant) => Object.keys(variant.modelMix)),
  );
  if (mixedArms.length > 0 || servedModels.size > 1) {
    lines.push(
      "> ⚠️ Диалоги обслужены разными моделями — сработало переключение пула.",
      "> Сравнение вариантов между собой при этом некорректно: разница может",
      "> объясняться моделью, а не подходом. Модели по вариантам:",
      ...result.variants
        .filter((variant) => variant.items > 0)
        .map(
          (variant) =>
            `> - \`${variant.variantId}\`: ${Object.entries(variant.modelMix)
              .map(([model, count]) => `${model} × ${count}`)
              .join(", ")}`,
        ),
      "",
    );
  }

  if (result.evaluationStrategyMismatch.length > 0) {
    lines.push(
      `> ⚠️ Разная стратегия оценки против \`${result.referenceVariantId}\`: ` +
        `${result.evaluationStrategyMismatch.map((id) => `\`${id}\``).join(", ")}.`,
      "> Сценарии размечены (близко к) правилами, а эти варианты судит LLM —",
      "> «F1 критериев» и «точность стиля» для них меряют в основном шум",
      "> судьи против источника разметки, а не эффект знания/персоны.",
      "",
    );
  }

  if (result.unpricedModels.length > 0) {
    lines.push(
      `> ⚠️ Цена неизвестна для: ${result.unpricedModels.join(", ")}.`,
      "> Колонка «$/диалог» показывает 0 для этих моделей — это отсутствующая",
      "> цена в MODEL_PRICING, а не подтверждённо бесплатный вызов. Добавьте",
      "> модель в packages/ai/src/provider/pricing.ts, если тариф известен.",
      "",
    );
  }

  const emptyArms = result.variants.filter((variant) => variant.items === 0);
  if (emptyArms.length > 0) {
    lines.push(
      `> ⛔ Ни одного успешного диалога у: ${emptyArms.map((variant) => `\`${variant.variantId}\``).join(", ")}.`,
      "> Эти варианты не сравнивались — по ним нет данных, а не нулевая ошибка.",
      "> Проверьте раздел «Несостоявшиеся сценарии»: если причина внешняя",
      "> (лимит провайдера, сеть), прогон надо повторить, а не делать выводы.",
      "",
    );
  }

  lines.push("## Значимость против контрольного варианта", "");
  lines.push(
    "Парный бутстрап[^ci] по сценариям, 95% доверительный интервал.",
    "Положительная Δ[^delta] — вариант лучше контрольного. Вывод «лучше» только если интервал не пересекает ноль.",
    "",
  );

  for (const comparison of result.comparisons) {
    lines.push(`### \`${comparison.variantId}\``, "");
    lines.push("| Метрика | Δ[^delta] | 95% ДИ[^ci] | p[^pvalue] | Вывод |");
    lines.push("| --- | ---: | :---: | ---: | --- |");
    for (const metric of comparison.metrics) {
      const digits = metric.metric === "costUsd" ? 4 : 2;
      const label = metric.label + (METRIC_FOOTNOTES[metric.metric] ?? "");
      lines.push(
        `| ${label} | ${signed(metric.delta, digits)} | [${metric.ciLow.toFixed(digits)}; ${metric.ciHigh.toFixed(digits)}] | ${metric.pValue.toFixed(3)} | ${verdict(metric)} |`,
      );
    }
    lines.push("", recommendation(comparison), "");
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
        : `**Доказанное улучшение MAE[^mae]:** ${wins.map((item) => `\`${item.variantId}\``).join(", ")}.`,
      "",
    );
  }

  if (result.comparisons.length > 0) {
    lines.push("## Живые примеры диалогов", "");
    lines.push(
      "Не только цифры: вот как каждый вариант реально отвечал на сценарий —",
      "по одному удачному и одному проблемному диалогу из первого прогона",
      "каждого сценария (повторные прогоны не сохраняют транскрипт).",
      "",
    );

    const referenceExample = pickExample(
      result.items,
      result.referenceVariantId,
      "best",
    );
    if (referenceExample) {
      lines.push(
        `### Контрольный вариант: \`${result.referenceVariantId}\``,
        "",
        ...renderExample(referenceExample),
      );
    }

    for (const comparison of result.comparisons) {
      lines.push(`### \`${comparison.variantId}\``, "");

      const best = pickExample(result.items, comparison.variantId, "best");
      const worst = pickExample(result.items, comparison.variantId, "worst");

      if (!best && !worst) {
        lines.push(
          "_Транскрипт не сохранён (нет диалогов первого прогона)._",
          "",
        );
        continue;
      }

      if (best) {
        lines.push("**Удачный пример:**", "", ...renderExample(best));
      }
      if (worst && worst.fixtureId !== best?.fixtureId) {
        lines.push("**Проблемный пример:**", "", ...renderExample(worst));
      }
    }
  }

  lines.push("## Сырые показатели", "");
  lines.push(
    "| Вариант | MAE[^mae] | σ внутри сценария[^sigma] | κ по стилю[^kappa] | F1 критериев[^f1] | Роль[^role] | Дрейф[^drift] | Молчание[^silence] | Задержка[^latency] | $/диалог[^cost] |",
  );
  lines.push(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );

  // An arm that produced no items has `scoreMae === 0`, which would sort it to
  // the top and read as a perfect score. Empty arms are listed last and shown
  // as "нет данных" — a variant that failed everywhere must never look best.
  const withData = result.variants.filter((variant) => variant.items > 0);
  const withoutData = result.variants.filter((variant) => variant.items === 0);
  const ranked = [
    ...withData.sort((a, b) => a.scoreMae - b.scoreMae),
    ...withoutData,
  ];

  for (const variant of ranked) {
    if (variant.items === 0) {
      lines.push(
        `| \`${variant.variantId}\` | нет данных | — | — | — | — | — | — | — | — |`,
      );
      continue;
    }
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
      `Согласие со стилем эксперта у контрольного варианта: κ[^kappa] = ${reference.styleKappa.toFixed(2)} (${kappaLabel(reference.styleKappa)}).`,
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
    lines.push("## Кривая обучения (MAE[^mae] по эпохам)", "");
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

  if (result.poolStats) {
    const served = Object.entries(result.poolStats.servedBy);
    if (served.length > 0) {
      lines.push("## Кто обслуживал запросы", "");
      lines.push("| Кандидат | Успешно | Отказы по лимиту | Не осилил схему |");
      lines.push("| --- | ---: | ---: | ---: |");
      const ids = new Set([
        ...served.map(([id]) => id),
        ...Object.keys(result.poolStats.availabilityFailures),
        ...Object.keys(result.poolStats.capabilityFailures),
      ]);
      for (const id of [...ids].sort()) {
        lines.push(
          `| \`${id}\` | ${result.poolStats.servedBy[id] ?? 0} | ${result.poolStats.availabilityFailures[id] ?? 0} | ${result.poolStats.capabilityFailures[id] ?? 0} |`,
        );
      }
      lines.push("");
    }
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

    // Provider-side failures (quota, rate limit, network) say nothing about
    // the variant. Reporting them together with genuine schema failures would
    // read as "graph-rag is unreliable" when the account simply ran dry.
    const external = result.failures.filter((failure) =>
      /额度|quota|rate.?limit|429|5\d\d|insufficient|balance|credit|overload|ECONNRESET|ETIMEDOUT|fetch failed|квот|лимит|остаток|баланс|предвычет|таймаут|сеть/i.test(
        failure.message,
      ),
    );

    lines.push("## Несостоявшиеся сценарии", "");
    lines.push(
      "Эти диалоги не доехали до оценки и исключены из всех метрик выше.",
      "Если сбоев много и они распределены неравномерно, сравнение вариантов",
      "смещено: вариант мог «выиграть», уронив именно трудные сценарии.",
      "",
    );

    if (external.length > 0) {
      lines.push(
        `> ⛔ Из них ${external.length} — внешние отказы провайдера (лимит, квота, сеть),`,
        "> а не свойство варианта. Прогон надо повторить: сравнивать по таким",
        "> результатам нельзя, порядок вариантов в очереди решает исход.",
        "",
      );
    }
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

  lines.push(...glossaryFootnotes());

  return lines.join("\n");
}

/**
 * Definitions for every abbreviation/term used above, as GitHub-flavored
 * markdown footnotes (`[^id]`). Referenced inline instead of explained where
 * they first appear, so the tables stay scannable for a reader who already
 * knows the vocabulary while a first-time reader can still look it up.
 */
function glossaryFootnotes(): string[] {
  return [
    "## Термины",
    "",
    "[^mae]: **MAE** (Mean Absolute Error, средняя абсолютная ошибка) — среднее из модулей расхождений между автоматической оценкой диалога и оценкой эксперта, по шкале 0–100 баллов. 0 — автоматическая оценка ни разу не разошлась с экспертной; чем выше значение, тем сильнее расхождение. Ниже — лучше.",
    "[^sigma]: σ (сигма) — стандартное отклонение автоматической оценки при нескольких повторных прогонах одного и того же сценария. Показывает разброс модели от прогона к прогону, а не различие между сценариями.",
    "[^kappa]: κ (каппа Коэна) — согласие автоматической оценки стиля с экспертной за вычетом согласия, которое дало бы случайное угадывание. В отличие от простой точности не завышается на перекошенном распределении меток. Шкала от −1 до 1; 0 — не лучше случайного.",
    "[^f1]: F1 — гармоническое среднее точности (precision) и полноты (recall) при сравнении набора критериев, распознанных моделью, с набором, ожидаемым по методике.",
    "[^role]: «Роль» (удержание роли) — доля диалогов, где персонаж ни разу не выдал запрещённую методическую лексику (не «спалил», что он — модель, а не сотрудник).",
    "[^drift]: «Дрейф» (дрейф персоны) — доля диалогов, где ответы персонажа сползают в ассистентский регистр, как правило во второй половине диалога.",
    "[^silence]: «Молчание» — доля диалогов, где персонаж корректно не отвечал, пока к нему не обратились явно.",
    "[^latency]: «Задержка» — среднее время ответа модели на одну реплику, в миллисекундах.",
    "[^cost]: «$/диалог» — средняя стоимость одного диалога в долларах США по тарифам, зашитым в `packages/ai/src/provider/pricing.ts`.",
    "[^delta]: Δ (дельта) — разница метрики между вариантом и контрольным вариантом, усреднённая по сценариям попарно (для каждого сценария отдельно, а не по общим средним). Положительное значение — вариант лучше контрольного.",
    "[^ci]: 95% ДИ — доверительный интервал разницы, посчитанный процентильным бутстрапом (10 000 ресэмплов пар «сценарий → разница»). `comparison.significant` считается true, только если есть не менее 5 пар (`pairs >= 5`) и интервал не пересекает ноль.",
    "[^pvalue]: p (p-значение) — вероятность получить не менее выраженную разницу случайно, по двустороннему парному перестановочному тесту (смена знака разности по каждому сценарию). Чем меньше p, тем менее правдоподобно, что наблюдаемая разница — шум.",
    "",
  ];
}
