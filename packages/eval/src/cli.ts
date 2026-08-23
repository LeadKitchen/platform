#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  BUILT_IN_VARIANTS,
  createProviderFromEnv,
  type VariantConfig,
} from "@acme/ai";

import { ALL_FIXTURES, FIXTURES } from "./fixtures";
import { buildCandidateArms, loadPromptArtifact } from "./optimize/artifact";

import { renderMarkdownReport } from "./report";
import { runEvaluation } from "./runner";
import { createSimulatedProvider } from "./simulated-provider";
import { flushTelemetry, initTelemetry } from "./telemetry";

initTelemetry();

type ProviderKind = "simulated" | "anthropic" | "openai" | "env";

const PROVIDER_KINDS: ProviderKind[] = [
  "simulated",
  "anthropic",
  "openai",
  "env",
];

interface Flags {
  variants: string[];
  provider: ProviderKind;
  epochs: number;
  runs: number;
  concurrency: number;
  limit?: number;
  extended: boolean;
  reference?: string;
  learn: boolean;
  out?: string;
  json?: string;
  /** Prompt artefacts from `optimize`, turned into arms against their control. */
  candidates: string[];
  /** Apply every `--candidate` to one arm instead of one arm each. */
  combine: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    variants: BUILT_IN_VARIANTS.map((variant) => variant.id),
    provider: "simulated",
    epochs: 1,
    runs: 1,
    concurrency: 1,
    extended: false,
    learn: false,
    candidates: [],
    combine: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--variants":
        if (next) flags.variants = next.split(",").map((id) => id.trim());
        index += 1;
        break;
      case "--provider": {
        const kind = PROVIDER_KINDS.find((value) => value === next);
        if (kind) flags.provider = kind;
        index += 1;
        break;
      }
      case "--epochs":
        if (next) flags.epochs = Number.parseInt(next, 10) || 1;
        index += 1;
        break;
      case "--runs":
        if (next) flags.runs = Number.parseInt(next, 10) || 1;
        index += 1;
        break;
      case "--concurrency":
        if (next) flags.concurrency = Number.parseInt(next, 10) || 1;
        index += 1;
        break;
      case "--limit":
        if (next) flags.limit = Number.parseInt(next, 10) || undefined;
        index += 1;
        break;
      case "--extended":
        flags.extended = true;
        break;
      case "--reference":
        if (next) flags.reference = next;
        index += 1;
        break;
      case "--learn":
        flags.learn = true;
        break;
      case "--candidate":
        if (next) flags.candidates.push(next);
        index += 1;
        break;
      case "--combine":
        flags.combine = true;
        break;
      case "--out":
        flags.out = next;
        index += 1;
        break;
      case "--json":
        flags.json = next;
        index += 1;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return flags;
}

function printHelp(): void {
  console.log(`Сравнение подходов ИИ-модуля деловой игры.

Использование:
  bun --filter @acme/eval eval [флаги]

Флаги:
  --variants a,b,c   какие варианты сравнивать (по умолчанию все встроенные)
  --provider p       simulated | anthropic | openai | env  (по умолч. simulated)
  --runs N           прогонов на сценарий: даёт разброс модели (реком. 4)
  --concurrency N    сколько сценариев считать параллельно (для обучаемых — 1)
  --limit N          взять только первые N сценариев (быстрая проверка)
  --extended         добавить EXTENDED_FIXTURES (шаг-в-сторону промахи) к
                      CORE_FIXTURES — перед решением о внедрении подхода,
                      не для повседневного прогона
  --reference ID     контрольный вариант для сравнения (по умолч. baseline)
  --epochs N         повторов набора сценариев (для обучаемых стратегий)
  --learn            передавать награду стратегиям с обучением
  --out FILE         записать markdown-отчёт
  --json FILE        записать сырые результаты в JSON
  --candidate FILE   JSON-артефакт из optimize (можно повторять).
                      Добавляет к --variants арм с этим промптом и его
                      контрольный вариант, взятый из самого артефакта — так что
                      сравнение всегда идёт против правильного контроля.
  --combine          все --candidate применяются к одному арму, а не к
                      одному арму на артефакт (для совместной проверки
                      нескольких слотов, например persona + criteria)

Примеры:
  bun --filter @acme/eval eval --variants baseline,rag,graph-rag
  bun --filter @acme/eval eval --provider openai --runs 4 --out reports/run.md
  bun --filter @acme/eval eval --variants baseline,skill-rl --epochs 5 --learn

Изолированные сравнения передовых техник — один арм против одного контроля,
не все сразу (рекомендуется --runs 4, --concurrency 3-4):
  # Retrieval: одинаковые persona и evaluation, меняется только knowledge
  bun --filter @acme/eval eval --provider env --variants hybrid-rag,contextual-rag --reference hybrid-rag --runs 4 --concurrency 4 --out reports/retrieval.md

  # Persona: меняется только способ генерации реплики
  bun --filter @acme/eval eval --provider env --variants baseline,self-consistency --reference baseline --runs 4 --out reports/persona.md

  # Judge: меняется только single-judge на debate
  bun --filter @acme/eval eval --provider env --variants baseline-judge,debate-judge --reference baseline-judge --runs 4 --out reports/judge.md

  # Проверка кандидата от optimize против его собственного контрольного варианта
  bun --filter @acme/eval eval --provider env --candidate reports/ax-criteria.json --runs 4 --out reports/candidate.md

  # Финальная проверка перед внедрением: добрать EXTENDED_FIXTURES
  bun --filter @acme/eval eval --provider env --variants hybrid-rag,contextual-rag --reference hybrid-rag --extended --runs 4 --out reports/retrieval-final.md

Примечание: contextual-rag при первом запуске обогащает каждый чанк через LLM;
стоимость прогрева учитывается в первом диалоге. Повторяйте все arms одинаковое
число раз и не смешивайте модели в одном сравнении. По умолчанию прогон идёт
на CORE_FIXTURES (12 сценариев, см. fixtures.ts) — этого достаточно, чтобы
поймать явную регрессию; --extended добавляет 8 сценариев "промах на одну
ступень" для более тонкого разрешения перед решением о внедрении.`);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  const provider =
    flags.provider === "simulated"
      ? createSimulatedProvider()
      : createProviderFromEnv(
          flags.provider === "env"
            ? process.env
            : { ...process.env, AI_PROVIDER: flags.provider },
        );

  const fixturePool = flags.extended ? ALL_FIXTURES : FIXTURES;
  const fixtures = flags.limit
    ? fixturePool.slice(0, flags.limit)
    : fixturePool;

  // A `--candidate` arm and its control must come from the same artefact:
  // building them separately is exactly the mistake this flag exists to rule
  // out — a candidate compared against a control that quietly drifted.
  const extraVariants: VariantConfig[] = [];
  let variantIds = flags.variants;
  let referenceVariantId = flags.reference;

  if (flags.candidates.length > 0) {
    const artifacts = await Promise.all(
      flags.candidates.map((path) => loadPromptArtifact(path)),
    );
    const arms = buildCandidateArms(artifacts, { combine: flags.combine });

    const controlIds = new Set(arms.map((arm) => arm.referenceVariantId));
    if (controlIds.size > 1) {
      throw new Error(
        `--candidate артефакты ссылаются на разные контрольные варианты (${[...controlIds].join(", ")}).`,
      );
    }

    for (const arm of arms) {
      extraVariants.push(arm.candidate);
      console.log(`  кандидат ${arm.candidate.id}: ${arm.provenance}`);
    }

    // Candidate arms replace the default variant list rather than adding to
    // it: `--variants` defaults to every built-in variant, and running all of
    // those alongside a candidate would bury the one comparison this flag is
    // for and burn quota on arms nobody asked to check.
    const usedDefaultVariants =
      flags.variants.length === BUILT_IN_VARIANTS.length &&
      flags.variants.every((id, index) => id === BUILT_IN_VARIANTS[index]?.id);
    variantIds = usedDefaultVariants
      ? [...controlIds, ...arms.map((arm) => arm.candidate.id)]
      : [...flags.variants, ...arms.map((arm) => arm.candidate.id)];
    referenceVariantId = referenceVariantId ?? [...controlIds][0];
  }

  console.log(
    `Запуск: варианты ${variantIds.join(", ")}; провайдер ${provider.id} (${provider.model}); сценариев ${fixtures.length}; прогонов ${flags.runs}; эпох ${flags.epochs}`,
  );

  const result = await runEvaluation({
    variantIds,
    provider,
    fixtures,
    variants: extraVariants,
    epochs: flags.epochs,
    runsPerFixture: flags.runs,
    concurrency: flags.concurrency,
    referenceVariantId,
    learn: flags.learn,
    onProgress: (message) => process.stdout.write(`  ${message}\r`),
  });

  process.stdout.write("\n");
  const report = renderMarkdownReport(result);
  console.log(report);

  if (flags.out) {
    await mkdir(dirname(resolve(flags.out)), { recursive: true });
    await writeFile(flags.out, report, "utf8");
    console.log(`\nОтчёт записан: ${flags.out}`);
  }

  if (flags.json) {
    await mkdir(dirname(resolve(flags.json)), { recursive: true });
    await writeFile(flags.json, JSON.stringify(result, null, 2), "utf8");
    console.log(`Сырые результаты: ${flags.json}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(flushTelemetry);
