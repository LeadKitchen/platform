#!/usr/bin/env bun
/**
 * Прогон всех технологий с публикацией в админку.
 *
 * Запускает три изолированных сравнения (Retrieval, Persona, Judge), каждое
 * на мощной модели с тремя повторами для доверительных интервалов. Результаты
 * публикуются в `game_benchmark_runs` и сразу видны на /admin/game/benchmarks.
 *
 * Использование:
 *   bun --env-file=../../.env run src/report-all.ts [флаги]
 *
 * Флаги:
 *   --model MODEL     какую модель использовать (по умолч. gpt-5.5)
 *   --runs N          повторов на сценарий (по умолч. 3)
 *   --limit N         взять первые N сценариев (по умолч. все)
 *   --concurrency N   параллельных диалогов (по умолч. 3)
 *   --dry-run         не публиковать, только сохранить JSON
 *   --skip S          пропустить сравнение: retrieval, persona, judge
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createAiSdkProvider,
  type LlmProvider,
  resolveVariant,
} from "@acme/ai";
import { db, GameBenchmarkRun } from "@acme/db";

import { FIXTURES } from "./fixtures";
import { renderMarkdownReport } from "./report";
import { type RunResult, runEvaluation } from "./runner";
import { flushTelemetry, initTelemetry } from "./telemetry";

initTelemetry();

interface Comparison {
  label: string;
  variantIds: string[];
  referenceVariantId: string;
}

const ALL_COMPARISONS: Comparison[] = [
  {
    label: "Retrieval: HyDE / Contextual / Rerank / CRAG",
    variantIds: [
      "hybrid-rag",
      "hyde-rag",
      "contextual-rag",
      "rerank-rag",
      "corrective-rag",
    ],
    referenceVariantId: "hybrid-rag",
  },
  {
    label: "Persona: Self-Consistency",
    variantIds: ["baseline", "self-consistency"],
    referenceVariantId: "baseline",
  },
  {
    label: "Judge: Multi-Agent Debate",
    variantIds: ["baseline-judge", "debate-judge"],
    referenceVariantId: "baseline-judge",
  },
];

function parseArgs(argv: string[]) {
  const read = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  const readInt = (flag: string, fallback: number): number =>
    Number.parseInt(read(flag) ?? "", 10) || fallback;

  const skip = new Set<string>();
  let at = argv.indexOf("--skip");
  while (at !== -1) {
    const val = argv[at + 1];
    if (val) skip.add(val.toLowerCase());
    at = argv.indexOf("--skip", at + 1);
  }

  return {
    model: read("--model") ?? "gpt-5.5",
    runs: readInt("--runs", 3),
    limit: read("--limit") ? readInt("--limit", 0) : undefined,
    concurrency: readInt("--concurrency", 3),
    dryRun: argv.includes("--dry-run"),
    skip,
  };
}

function createProvider(model: string): LlmProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://router.cheap/v1";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY не задан — платный прогон невозможен.");
  }

  return createAiSdkProvider({
    vendor: "openai-compatible",
    model,
    apiKey,
    baseUrl,
    // router.cheap proxies many backends; native structured outputs are not
    // guaranteed, so the schema goes into the prompt on every call.
    supportsStructuredOutputs: false,
    maxAttempts: 3,
    maxOutputTokens: 4000,
  });
}

async function publish(
  label: string,
  result: RunResult,
  dryRun: boolean,
): Promise<void> {
  const reportsDir = resolve(import.meta.dirname, "../reports");
  await mkdir(reportsDir, { recursive: true });

  const safeLabel = label.replace(/[^a-zA-Zа-яА-Я0-9_-]/g, "_").toLowerCase();
  const jsonPath = resolve(reportsDir, `${safeLabel}.json`);
  const mdPath = resolve(reportsDir, `${safeLabel}.md`);

  await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf8");
  await writeFile(mdPath, renderMarkdownReport(result), "utf8");
  console.log(`  → JSON: ${jsonPath}`);
  console.log(`  → Markdown: ${mdPath}`);

  if (dryRun) {
    console.log("  → Публикация пропущена (--dry-run)");
    return;
  }

  const [row] = await db
    .insert(GameBenchmarkRun)
    .values({ label, result: result as unknown as Record<string, unknown> })
    .returning({ id: GameBenchmarkRun.id });

  console.log(`  → Опубликовано в /admin/game/benchmarks (id ${row?.id})`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const provider = createProvider(args.model);
  const fixtures = args.limit ? FIXTURES.slice(0, args.limit) : FIXTURES;

  const comparisons = ALL_COMPARISONS.filter((comparison) => {
    const tag = comparison.label.split(":")[0]?.trim().toLowerCase() ?? "";
    return !args.skip.has(tag);
  });

  if (comparisons.length === 0) {
    console.log("Все сравнения пропущены (--skip). Нечего делать.");
    return;
  }

  console.log(
    [
      "═══════════════════════════════════════════════════",
      " Полный прогон технологий для заказчика",
      "═══════════════════════════════════════════════════",
      `  Модель: ${args.model}`,
      `  Сценариев: ${fixtures.length}`,
      `  Прогонов на сценарий: ${args.runs}`,
      `  Параллельность: ${args.concurrency}`,
      `  Сравнений: ${comparisons.length}`,
      `  Публикация: ${args.dryRun ? "отключена" : "в БД"}`,
      "",
    ].join("\n"),
  );

  for (const [index, comparison] of comparisons.entries()) {
    const header = `[${index + 1}/${comparisons.length}] ${comparison.label}`;
    console.log(`\n${header}`);
    console.log("─".repeat(header.length));
    console.log(
      `  Варианты: ${comparison.variantIds.join(", ")}`,
      `\n  Контроль: ${comparison.referenceVariantId}`,
    );

    // Validate all variants exist before spending API calls.
    for (const id of comparison.variantIds) resolveVariant(id);

    const startedAt = Date.now();
    const result = await runEvaluation({
      variantIds: comparison.variantIds,
      provider,
      fixtures,
      runsPerFixture: args.runs,
      concurrency: args.concurrency,
      referenceVariantId: comparison.referenceVariantId,
      onProgress: (message) => process.stdout.write(`  ${message}\r`),
    });
    process.stdout.write("\n");

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const failures = result.failures.length;
    console.log(
      `  Завершено за ${elapsed}с. Сбоев: ${failures}/${fixtures.length * comparison.variantIds.length * args.runs}.`,
    );

    // Print a quick summary before publishing.
    for (const variant of result.variants) {
      if (variant.items === 0) continue;
      console.log(
        `    ${variant.variantId.padEnd(20)} MAE=${variant.scoreMae.toFixed(1)}  κ=${variant.styleKappa.toFixed(2)}  F1=${variant.criteriaF1.toFixed(2)}  $/дiалог=$${variant.avgCostUsd.toFixed(4)}`,
      );
    }

    await publish(comparison.label, result, args.dryRun);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log(
    ` Готово. ${comparisons.length} отчётов${args.dryRun ? " сохранены локально" : " опубликованы в /admin/game/benchmarks"}.`,
  );
  console.log("═══════════════════════════════════════════════════\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await flushTelemetry();
    // The Drizzle pool does not self-close; without an explicit exit the
    // process would hang indefinitely after a successful run.
    process.exit(process.exitCode ?? 0);
  });
