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
import { flushTelemetry, initTelemetry } from "../telemetry";
import { loadPromptArtifact, writePromptArtifact } from "./artifact";
import { createAxClientFromEnv } from "./ax-client";
import { AX_JUDGE_SLOTS, bootstrapJudgePrompt } from "./ax-few-shot";
import { type GepaSlot, optimizePrompt } from "./gepa";
import { buildJudgeCorpus } from "./judge-corpus";
import { mean, type PromptSlotParam, scoreCandidate } from "./objective";

initTelemetry();

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
  console.log(`Оптимизация промптов. Два оптимизатора над одной целевой функцией.

Использование:
  bun --filter @acme/eval optimize --slot persona [флаги]
  bun --filter @acme/eval optimize --optimizer ax --slot style [флаги]

Оптимизаторы (--optimizer):
  gepa   (по умолчанию) Рефлективная эволюция инструкции по Парето-фронту.
         Переписывает текст инструкции. Работает со всеми слотами.
  ax     Bootstrap few-shot на @ax-llm/ax. Не переписывает инструкцию, а
         подбирает размеченные примеры и дописывает их к ней. Только слоты
         style и criteria: у persona нет эталонной реплики, с которой можно
         сверить пример.

Общие флаги:
  --slot s          persona | style | criteria   (что оптимизируем)
  --variant ID      базовый вариант конвейера (по умолч. baseline-judge)
  --limit N         сколько сценариев взять всего (по умолч. 24)
  --concurrency N   параллельных сценариев (по умолч. 4)
  --out FILE        куда записать найденный промпт (JSON-артефакт)
  --seed-from FILE  стартовать не от промпта из кода, а от найденного ранее
                    артефакта того же слота. Этим оптимизаторы композируются:
                    gepa переписывает инструкцию, ax навешивает на неё примеры.

Флаги gepa:
  --iterations N    шагов мутации (по умолч. 6)
  --minibatch N     сценариев на шаг рефлексии (по умолч. 6)

Флаги ax:
  --max-demos N     сколько примеров попадёт в промпт (по умолч. 3)
  --rounds N        раундов бутстрапа (по умолч. 3)
  --max-demo-chars N  предел длины расшифровки для примера (по умолч. 2000).
                    Слабые модели иногда выдают в реплику всё своё рассуждение;
                    такой сценарий годится для замера, но не для примера.
  --refresh-corpus  перестроить кэш транскриптов
  --no-validate     не прогонять найденный промпт против исходного

Результат — JSON-артефакт. Оптимизатор ничего не доказывает сам по себе, он
только предлагает кандидата; доказательство даёт прогон против контрольного
арма с доверительным интервалом:

  bun --filter @acme/eval eval --provider env --candidate FILE --runs 3

Несколько артефактов можно применить сразу, а с --combine — одним армом:

  bun --filter @acme/eval eval --provider env \\
    --candidate persona.json --candidate style.json --combine --runs 3`);
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

  const optimizer = read("--optimizer") ?? "gepa";
  if (optimizer !== "gepa" && optimizer !== "ax") {
    console.error(
      `Неизвестный оптимизатор "${optimizer}". Доступны: gepa, ax.`,
    );
    process.exit(1);
  }

  const slotName = read("--slot") ?? "persona";
  const variantId = read("--variant") ?? "baseline-judge";
  const limit = readInt("--limit", 24);
  const concurrency = readInt("--concurrency", 4);
  const fixtures = FIXTURES.slice(0, limit);
  const baseVariant = resolveVariant(variantId);
  const provider = createProviderFromEnv();
  const out = read("--out");

  /**
   * Starting text for the optimiser.
   *
   * Chaining is the point: an Ax few-shot run seeded from a GEPA artefact
   * attaches demonstrations to the *optimised* instruction rather than to the
   * one in the source, which is the only way the two optimisers compose.
   */
  const seedFrom = read("--seed-from");
  const loadSeed = async (
    param: PromptSlotParam,
  ): Promise<string | undefined> => {
    if (!seedFrom) return undefined;
    const artifact = await loadPromptArtifact(seedFrom);
    if (artifact.slot !== param) {
      console.error(
        `Артефакт ${seedFrom} относится к слоту "${artifact.slot}", а оптимизируется "${param}". Слоты должны совпадать.`,
      );
      process.exit(1);
    }
    console.log(
      `  стартовый промпт взят из артефакта ${seedFrom} (${artifact.optimizer})`,
    );
    return artifact.prompt;
  };

  const writeResult = async (
    payload: Parameters<typeof writePromptArtifact>[1],
    prompt: string,
  ) => {
    if (out) {
      await writePromptArtifact(out, payload);
      console.log(`Артефакт записан: ${out}`);
      console.log(
        `Проверить: bun --filter @acme/eval eval --provider env --candidate ${out} --runs 3`,
      );
      return;
    }
    console.log("--- НАЙДЕННЫЙ ПРОМПТ ---");
    console.log(prompt);
  };

  if (optimizer === "ax") {
    const slot = AX_JUDGE_SLOTS[slotName as keyof typeof AX_JUDGE_SLOTS];
    if (!slot) {
      console.error(
        `Оптимизатор ax работает только со слотами ${Object.keys(AX_JUDGE_SLOTS).join(", ")}. ` +
          `Для слота "${slotName}" используйте --optimizer gepa: у persona нет эталонного ответа, ` +
          "с которым можно сверить подобранный пример.",
      );
      process.exit(1);
    }

    const axClient = createAxClientFromEnv();
    console.log(
      `Bootstrap few-shot (Ax) для слота "${slot.name}" (${slot.param}) на варианте ${variantId}.\n` +
        `  скоринг: ${provider.id} (${provider.model})\n` +
        `  Ax-клиент: ${axClient.candidateId} — один эндпоинт, без failover-пула`,
    );

    // Judge prompts cannot change the transcript, so the dialogs are replayed
    // once and reused for every candidate. This is the whole reason judge
    // optimisation is cheap here and expensive under GEPA.
    const samples = await buildJudgeCorpus({
      fixtures,
      variant: baseVariant,
      provider,
      concurrency,
      refresh: argv.includes("--refresh-corpus"),
      onProgress: (message) => console.log(`  ${message}`),
    });

    const chainedSeed = await loadSeed(slot.param);

    const result = await bootstrapJudgePrompt({
      slot: chainedSeed ? { ...slot, seed: chainedSeed } : slot,
      samples,
      client: axClient.client,
      maxDemos: readInt("--max-demos", 3),
      maxRounds: readInt("--rounds", 3),
      maxDemoTranscriptChars: readInt("--max-demo-chars", 2000),
      onProgress: (message) => console.log(`  ${message}`),
    });

    console.log(
      [
        "",
        `Отобрано примеров: ${result.demoCount}` +
          (result.demoFixtureIds.length > 0
            ? ` (${result.demoFixtureIds.join(", ")})`
            : ""),
        `Метрика бутстрапа: ${result.bootstrapScore.toFixed(3)}`,
        `Корпус: ${result.trainSize} на подбор, ${result.validationSize} на проверку` +
          (result.skippedSamples > 0
            ? `, ${result.skippedSamples} отброшено по длине расшифровки`
            : ""),
        `Промпт вырос с ${result.seed.length} до ${result.prompt.length} символов`,
        "",
      ].join("\n"),
    );

    if (result.demoCount === 0) {
      console.log(
        "Ни один прогон не совпал с экспертной меткой достаточно точно, чтобы стать примером.\n" +
          "Промпт не изменился. Это осмысленный результат: на этой модели судья\n" +
          "не воспроизводит разметку, и few-shot ей не поможет — сначала нужна модель посильнее.",
      );
      return;
    }

    let seedScore: number | undefined;
    let candidateScore: number | undefined;

    if (!argv.includes("--no-validate")) {
      console.log(
        "Проверка: исходный промпт против найденного, полный прогон.",
      );
      // Sequential on purpose: the two arms share one quota, and running them
      // together is the fastest way to trip a free-tier rate limit and lose
      // both numbers.
      const seedScores = await scoreCandidate({
        param: slot.param,
        text: result.seed,
        baseVariant,
        provider,
        fixtures,
        concurrency,
        label: "seed",
      });
      const candidateScores = await scoreCandidate({
        param: slot.param,
        text: result.prompt,
        baseVariant,
        provider,
        fixtures,
        concurrency,
        label: "fewshot",
      });

      seedScore = mean([...seedScores.values()]);
      candidateScore = mean([...candidateScores.values()]);
      const improvement = candidateScore - seedScore;

      console.log(
        [
          "",
          `Исходный промпт: ${seedScore.toFixed(3)}`,
          `С примерами:     ${candidateScore.toFixed(3)}`,
          `Прирост: ${improvement >= 0 ? "+" : ""}${improvement.toFixed(3)}`,
          "",
          "⚠️ Один прогон не даёт доверительного интервала. Прогоните оба промпта",
          "командой eval с --runs 3, прежде чем принимать решение.",
          "",
        ].join("\n"),
      );
    }

    await writeResult(
      {
        optimizer: chainedSeed
          ? "ax-bootstrap-few-shot (поверх артефакта)"
          : "ax-bootstrap-few-shot",
        slot: result.param,
        variantId,
        demoCount: result.demoCount,
        demoFixtureIds: result.demoFixtureIds,
        bootstrapScore: result.bootstrapScore,
        seedScore,
        bestScore: candidateScore,
        prompt: result.prompt,
      },
      result.prompt,
    );
    return;
  }

  const slot = SLOTS[slotName];
  if (!slot) {
    console.error(
      `Неизвестный слот "${slotName}". Доступны: ${Object.keys(SLOTS).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `Оптимизация слота "${slotName}" (${slot.param}) на варианте ${variantId}; провайдер ${provider.id} (${provider.model})`,
  );

  const chainedSeed = await loadSeed(slot.param);

  const result = await optimizePrompt({
    slot: chainedSeed ? { ...slot, seed: chainedSeed } : slot,
    baseVariant,
    provider,
    fixtures,
    iterations: readInt("--iterations", 6),
    minibatchSize: readInt("--minibatch", 6),
    concurrency,
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

  await writeResult(
    {
      optimizer: "gepa",
      slot: result.slot,
      variantId,
      seedScore: result.seedScore,
      bestScore: result.bestScore,
      rationale: result.best.rationale,
      prompt: result.best.text,
    },
    result.best.text,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(flushTelemetry);
