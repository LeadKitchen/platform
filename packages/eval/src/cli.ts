#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { BUILT_IN_VARIANTS, createProviderFromEnv } from "@acme/ai";

import { renderMarkdownReport } from "./report";
import { runEvaluation } from "./runner";
import { createSimulatedProvider } from "./simulated-provider";

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
  learn: boolean;
  out?: string;
  json?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    variants: BUILT_IN_VARIANTS.map((variant) => variant.id),
    provider: "simulated",
    epochs: 1,
    learn: false,
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
      case "--learn":
        flags.learn = true;
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
  --epochs N         повторов набора сценариев (для обучаемых стратегий)
  --learn            передавать награду стратегиям с обучением
  --out FILE         записать markdown-отчёт
  --json FILE        записать сырые результаты в JSON

Примеры:
  bun --filter @acme/eval eval --variants baseline,rag,graph-rag
  bun --filter @acme/eval eval --provider anthropic --out reports/run.md
  bun --filter @acme/eval eval --variants baseline,skill-rl --epochs 5 --learn`);
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

  console.log(
    `Запуск: варианты ${flags.variants.join(", ")}; провайдер ${provider.id}; эпох ${flags.epochs}`,
  );

  const result = await runEvaluation({
    variantIds: flags.variants,
    provider,
    epochs: flags.epochs,
    learn: flags.learn,
    onProgress: (message) => process.stdout.write(`  ${message}\r`),
  });

  process.stdout.write("\n");
  const report = renderMarkdownReport(result);
  console.log(report);

  if (flags.out) {
    await mkdir(dirname(flags.out), { recursive: true });
    await writeFile(flags.out, report, "utf8");
    console.log(`\nОтчёт записан: ${flags.out}`);
  }

  if (flags.json) {
    await mkdir(dirname(flags.json), { recursive: true });
    await writeFile(flags.json, JSON.stringify(result, null, 2), "utf8");
    console.log(`Сырые результаты: ${flags.json}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
