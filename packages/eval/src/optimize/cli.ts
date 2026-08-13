#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  CRITERIA_JUDGE_SYSTEM,
  createProviderFromEnv,
  DEFAULT_ROLE_RULES,
  resolveVariant,
  STYLE_JUDGE_SYSTEM,
} from "@acme/ai";

import { FIXTURES } from "../fixtures";
import { type GepaSlot, optimizePrompt } from "./gepa";

const SLOTS: Record<string, GepaSlot> = {
  persona: {
    param: "roleRules",
    role: "правила поведения ИИ-сотрудника в ролевой игре: он должен оставаться поваром, не выдавать методологию и вести себя по своей компетенции",
    seed: DEFAULT_ROLE_RULES,
  },
  style: {
    param: "styleJudgeSystem",
    role: "инструкция судье, который по расшифровке диалога определяет, какие стили управления использовал руководитель и в какой пропорции",
    seed: STYLE_JUDGE_SYSTEM,
  },
  criteria: {
    param: "criteriaJudgeSystem",
    role: "инструкция судье, который решает, какие управленческие действия руководитель реально выполнил, и считает грубые реплики",
    seed: CRITERIA_JUDGE_SYSTEM,
  },
};

function printHelp(): void {
  console.log(`Оптимизация промптов (GEPA: рефлективная эволюция по Парето-фронту).

Использование:
  bun --filter @acme/eval optimize --slot persona [флаги]

Флаги:
  --slot s          persona | style | criteria   (что оптимизируем)
  --variant ID      базовый вариант конвейера (по умолч. baseline-judge)
  --iterations N    шагов мутации (по умолч. 6)
  --minibatch N     сценариев на шаг рефлексии (по умолч. 6)
  --limit N         сколько сценариев взять всего (по умолч. 24)
  --concurrency N   параллельных сценариев (по умолч. 4)
  --out FILE        куда записать найденный промпт (JSON)

Результат — обычный JSON с текстом промпта. Подставьте его в params варианта
и сравните с контрольным armом обычным прогоном eval: оптимизатор ничего не
доказывает сам по себе, он только предлагает кандидата.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    printHelp();
    return;
  }

  const read = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  const readInt = (flag: string, fallback: number): number =>
    Number.parseInt(read(flag) ?? "", 10) || fallback;

  const slotName = read("--slot") ?? "persona";
  const slot = SLOTS[slotName];
  if (!slot) {
    console.error(
      `Неизвестный слот "${slotName}". Доступны: ${Object.keys(SLOTS).join(", ")}`,
    );
    process.exit(1);
  }

  const variantId = read("--variant") ?? "baseline-judge";
  const limit = readInt("--limit", 24);
  const provider = createProviderFromEnv();

  console.log(
    `Оптимизация слота "${slotName}" (${slot.param}) на варианте ${variantId}; провайдер ${provider.id} (${provider.model})`,
  );

  const result = await optimizePrompt({
    slot,
    baseVariant: resolveVariant(variantId),
    provider,
    fixtures: FIXTURES.slice(0, limit),
    iterations: readInt("--iterations", 6),
    minibatchSize: readInt("--minibatch", 6),
    concurrency: readInt("--concurrency", 4),
    onProgress: (message) => console.log(`  ${message}`),
  });

  const improvement = result.bestScore - result.seedScore;
  console.log(
    [
      "",
      `Исходный промпт на отложенной выборке: ${result.seedScore.toFixed(3)}`,
      `Лучший кандидат (${result.best.id}):        ${result.bestScore.toFixed(3)}`,
      `Прирост: ${improvement >= 0 ? "+" : ""}${improvement.toFixed(3)}`,
      `Вызовов сценариев: ${result.evaluations}`,
      "",
      result.best.id === "seed"
        ? "Оптимизатор не нашёл кандидата лучше исходного промпта."
        : `Обоснование: ${result.best.rationale}`,
      "",
      "⚠️ Это результат на отложенной выборке внутри оптимизатора, а не",
      "доказательство. Прогоните найденный промпт против контрольного варианта",
      "командой eval с --runs 3, чтобы получить доверительный интервал.",
      "",
    ].join("\n"),
  );

  const out = read("--out");
  if (out) {
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(
      out,
      JSON.stringify(
        {
          slot: result.slot,
          variantId,
          seedScore: result.seedScore,
          bestScore: result.bestScore,
          rationale: result.best.rationale,
          prompt: result.best.text,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`Промпт записан: ${out}`);
  } else {
    console.log("--- НАЙДЕННЫЙ ПРОМПТ ---");
    console.log(result.best.text);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
