import { CRITERIA_JUDGE_SYSTEM, STYLE_JUDGE_SYSTEM } from "@acme/ai";
import {
  type CriterionId,
  MANAGEMENT_STYLES,
  type ManagementStyle,
} from "@acme/game";
import {
  type AxAIService,
  AxBootstrapFewShot,
  type AxGenOut,
  type AxMetricFn,
  type AxOptimizerResult,
  type AxTypedExample,
  ax,
  f,
} from "@ax-llm/ax";
import { z } from "zod";

import { setScore } from "../metrics";
import type { JudgeSample } from "./judge-corpus";
import type { PromptSlotParam } from "./objective";

/**
 * Few-shot demonstration bootstrapping for the judge prompts, via Ax.
 *
 * This is the one thing the in-house GEPA optimiser cannot do. GEPA rewrites
 * *instructions*: it reads the failing scenarios and proposes better wording.
 * It never adds examples. In practice a judge learns more from three worked
 * cases than from another paragraph of rules, and the harness already owns the
 * ground truth needed to produce them (`FIXTURES` with expert labels).
 *
 * How bootstrapping works, and why the output is trustworthy:
 *
 *  1. The judging task is declared as an Ax signature — transcript in, verdict
 *     out — so Ax owns prompt rendering, parsing, validation and retry for the
 *     teacher calls.
 *  2. Ax runs the task over the labelled corpus and keeps only the traces whose
 *     verdict *agrees with the expert label*. A demo is therefore a case the
 *     model got right, not a case a human wrote by hand.
 *  3. The surviving traces are rendered back into a few-shot block appended to
 *     the seed instruction, in the exact JSON shape `packages/ai`'s judge
 *     schemas expect.
 *
 * The result is an ordinary string for `VariantConfig.params`, so it is scored
 * by the same `runEvaluation` + `objective` path as a GEPA candidate. Ax never
 * touches the product code path — only the demos it selected do, and they
 * arrive as prompt text.
 *
 * Deliberate limitation: **the persona slot is not supported.** `roleRules`
 * has no gold output to bootstrap against — there is no reference reply for a
 * cook — so a "demo" there would be the model imitating itself. GEPA remains
 * the right tool for `roleRules`.
 */

export type AxJudgeSlotName = "style" | "criteria";

export interface AxJudgeSlot {
  name: AxJudgeSlotName;
  /** Variant parameter the rendered prompt is written to. */
  param: PromptSlotParam;
  /** What the prompt is for; kept alongside the seed for the CLI's help. */
  role: string;
  seed: string;
}

export const AX_JUDGE_SLOTS: Record<AxJudgeSlotName, AxJudgeSlot> = {
  style: {
    name: "style",
    param: "styleJudgeSystem",
    role: "инструкция судье, который по расшифровке диалога определяет, какие стили управления использовал руководитель и в какой пропорции",
    seed: STYLE_JUDGE_SYSTEM,
  },
  criteria: {
    name: "criteria",
    param: "criteriaJudgeSystem",
    role: "инструкция судье, который решает, какие управленческие действия руководитель реально выполнил, и считает грубые реплики",
    seed: CRITERIA_JUDGE_SYSTEM,
  },
};

/**
 * Ax-side contract for the style judge.
 *
 * Flat number fields instead of the nested `distribution` object of
 * `styleAnalysisSchema`: the models this harness runs on are small free-tier
 * ones, and a flat field list is the shape they hold most reliably. The nesting
 * is restored when the demo is rendered, so what lands in the prompt still
 * matches the production schema exactly.
 */
const styleSignature = f()
  .input(
    "transcript",
    z.string().describe("Расшифровка диалога руководителя с сотрудником"),
  )
  .output(
    "directiveShare",
    z.number().describe("Доля директивного стиля в речи руководителя, 0..1"),
  )
  .output(
    "coachingShare",
    z.number().describe("Доля наставнического стиля, 0..1"),
  )
  .output(
    "supportingShare",
    z.number().describe("Доля поддерживающего стиля, 0..1"),
  )
  .output(
    "delegatingShare",
    z.number().describe("Доля делегирующего стиля, 0..1"),
  )
  .output(
    "evidence",
    z
      .array(
        z.object({
          style: z.enum(MANAGEMENT_STYLES),
          quote: z.string().describe("Короткая дословная цитата руководителя"),
        }),
      )
      .describe("По одной опорной цитате на каждый замеченный стиль"),
  )
  .build();

/** Ax-side contract for the criteria judge. */
const criteriaSignature = f()
  .input(
    "transcript",
    z.string().describe("Расшифровка диалога руководителя с сотрудником"),
  )
  .input(
    "criteria",
    z.string().describe("Список критериев для проверки, по одному в строке"),
  )
  .output(
    "verdicts",
    z
      .array(
        z.object({
          id: z.string().describe("Идентификатор критерия из списка"),
          met: z.boolean(),
          comment: z
            .string()
            .optional()
            .describe("Обоснование одним предложением на русском языке"),
        }),
      )
      .describe("Вердикт по каждому критерию из списка"),
  )
  .output(
    "toxicTurns",
    z
      .number()
      .describe("Сколько реплик руководителя были грубыми или вне сценария"),
  )
  .output(
    "toxicQuotes",
    z
      .array(z.string())
      .describe(
        "Дословные цитаты грубых реплик — по одной на каждую в toxicTurns",
      ),
  )
  .build();

type StyleShares = Record<ManagementStyle, number>;

function sharesFromPrediction(prediction: unknown): StyleShares {
  const record = (prediction ?? {}) as Record<string, unknown>;
  const read = (key: string): number => {
    const value = record[key];
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  return {
    directive: read("directiveShare"),
    coaching: read("coachingShare"),
    supporting: read("supportingShare"),
    delegating: read("delegatingShare"),
  };
}

function dominantStyle(shares: StyleShares): ManagementStyle {
  let best: ManagementStyle = MANAGEMENT_STYLES[0];
  for (const style of MANAGEMENT_STYLES) {
    if (shares[style] > shares[best]) best = style;
  }
  return best;
}

/** Renormalise to sum 1, as `styleAnalysisSchema` asks the judge to do. */
function normalizeShares(shares: StyleShares): StyleShares {
  const total = MANAGEMENT_STYLES.reduce(
    (sum, style) => sum + shares[style],
    0,
  );
  if (total <= 0) {
    return {
      directive: 0.25,
      coaching: 0.25,
      supporting: 0.25,
      delegating: 0.25,
    };
  }
  return {
    directive: Number((shares.directive / total).toFixed(2)),
    coaching: Number((shares.coaching / total).toFixed(2)),
    supporting: Number((shares.supporting / total).toFixed(2)),
    delegating: Number((shares.delegating / total).toFixed(2)),
  };
}

/**
 * Metrics the bootstrapper filters traces by.
 *
 * Chosen to mirror the harness's own `actualStyleAccuracy` and `criteriaF1`
 * rather than to be smooth: a demo is only worth keeping if it is right by the
 * same standard the benchmark reports.
 */
/**
 * Every quote in a trace must really occur in the transcript.
 *
 * A demo is copied into the prompt verbatim, so a fabricated quote does not
 * just cost a point — it teaches the judge that inventing evidence is
 * acceptable. This mirrors what `judgeCriteria` already does in production,
 * where a toxicity quote is only counted if it is found in the manager's turns.
 */
function quotesAreGrounded(quotes: unknown, transcript: unknown): boolean {
  if (typeof transcript !== "string") return false;
  if (!Array.isArray(quotes)) return true;
  return quotes.every((quote) => {
    const text = typeof quote === "string" ? quote : undefined;
    if (!text) return false;
    return transcript.includes(text.trim());
  });
}

const styleMetric: AxMetricFn = ({ prediction, example }) => {
  const expected = example.labelActualStyle;
  if (typeof expected !== "string") return 0;
  if (dominantStyle(sharesFromPrediction(prediction)) !== expected) return 0;

  const evidence = (prediction as { evidence?: unknown })?.evidence;
  const quotes = Array.isArray(evidence)
    ? evidence.map((item) => (item as { quote?: unknown })?.quote)
    : [];

  return quotesAreGrounded(quotes, example.transcript) ? 1 : 0;
};

const criteriaMetric: AxMetricFn = ({ prediction, example }) => {
  const expected = Array.isArray(example.labelMetCriteria)
    ? (example.labelMetCriteria as CriterionId[])
    : [];
  const verdicts = (prediction as { verdicts?: unknown })?.verdicts;
  const predicted = Array.isArray(verdicts)
    ? verdicts
        .filter(
          (item): item is { id: string; met: boolean } =>
            typeof item === "object" &&
            item !== null &&
            (item as { met?: unknown }).met === true &&
            typeof (item as { id?: unknown }).id === "string",
        )
        .map((item) => item.id as CriterionId)
    : [];

  const toxicQuotes = (prediction as { toxicQuotes?: unknown })?.toxicQuotes;
  if (!quotesAreGrounded(toxicQuotes, example.transcript)) return 0;

  return setScore(predicted, expected).f1;
};

/**
 * Seed distribution for a labelled scenario.
 *
 * The fixture label records *which* style the scripted manager played, not a
 * measured mixture, so this is deliberately a dominance signal rather than a
 * one-hot: a `1.0 / 0 / 0 / 0` seed would teach the judge that dialogs are pure,
 * which is the exact error the harness penalises on mixed transcripts. The
 * demos that actually reach the prompt come from the model's own traces and
 * carry realistic mixtures; this only shapes what the bootstrapper shows the
 * model while it collects them.
 */
function goldShares(actualStyle: ManagementStyle): StyleShares {
  const shares: StyleShares = {
    directive: 0.1,
    coaching: 0.1,
    supporting: 0.1,
    delegating: 0.1,
  };
  shares[actualStyle] = 0.7;
  return shares;
}

/**
 * Training examples carry the expected outputs, not just the inputs.
 *
 * `AxBootstrapFewShot` shows the *other* training examples in context while it
 * generates a candidate trace for the current one, so an example without output
 * values is rejected outright. That also means the gold values here are not
 * decoration — they are what the model imitates while demos are collected.
 */
function styleExample(sample: JudgeSample): AxTypedExample<{
  transcript: string;
}> {
  const gold = goldShares(sample.label.actualStyle);
  return {
    transcript: sample.transcript,
    directiveShare: gold.directive,
    coachingShare: gold.coaching,
    supportingShare: gold.supporting,
    delegatingShare: gold.delegating,
    // Quoting the script is the only honest source of evidence available: the
    // label says which style was played, never where.
    evidence: sample.managerTurns.slice(0, 2).map((quote) => ({
      style: sample.label.actualStyle,
      quote,
    })),
    // Prefixed with `label` so it cannot collide with a signature field. Ax
    // renders only declared fields; everything else rides along to the metric.
    labelActualStyle: sample.label.actualStyle,
  };
}

function criteriaExample(sample: JudgeSample): AxTypedExample<{
  transcript: string;
  criteria: string;
}> {
  const met = new Set<string>(sample.label.metCriteria);
  return {
    transcript: sample.transcript,
    criteria: sample.criteriaList,
    // `comment` is left out on purpose: there is no reference wording, and a
    // placeholder would teach the judge to write placeholders. The harvested
    // demos carry the model's own comments.
    verdicts: sample.criterionIds.map((id) => ({ id, met: met.has(id) })),
    toxicTurns: sample.toxicManagerQuotes.length,
    toxicQuotes: sample.toxicManagerQuotes,
    labelMetCriteria: sample.label.metCriteria,
  };
}

/** Render one selected trace as the JSON the production judge must emit. */
function renderStyleDemo(trace: Record<string, unknown>): string {
  const shares = normalizeShares(sharesFromPrediction(trace));
  const evidence = Array.isArray(trace.evidence) ? trace.evidence : [];
  return JSON.stringify({ distribution: shares, evidence });
}

function renderCriteriaDemo(trace: Record<string, unknown>): string {
  const verdicts = Array.isArray(trace.verdicts) ? trace.verdicts : [];
  const toxicTurns = Number(trace.toxicTurns);
  const toxicQuotes = Array.isArray(trace.toxicQuotes) ? trace.toxicQuotes : [];
  return JSON.stringify({
    criteria: verdicts,
    toxicTurns: Number.isFinite(toxicTurns) ? Math.max(0, toxicTurns) : 0,
    toxicQuotes,
  });
}

export interface AxFewShotOptions {
  slot: AxJudgeSlot;
  /** Labelled transcripts, from `buildJudgeCorpus`. */
  samples: JudgeSample[];
  /** Model that answers the judging task while demos are being collected. */
  client: AxAIService;
  /** Stronger model for the teacher role; defaults to `client`. */
  teacherClient?: AxAIService;
  /**
   * How many demos end up in the prompt.
   *
   * Each demo carries a whole transcript, so this is the main cost knob: three
   * demos add roughly a thousand tokens to every judge call for the rest of the
   * variant's life. Free tiers meter tokens per minute, not just per day.
   */
  maxDemos?: number;
  /** Bootstrap rounds. Each round re-runs the task over the training split. */
  maxRounds?: number;
  /** Fraction of the corpus used for demo collection. */
  trainSplit?: number;
  /**
   * Longest transcript allowed to become a demo.
   *
   * Not cosmetic. On the free-tier models this harness runs on, a persona reply
   * occasionally comes back as the model's entire chain of thought, which lands
   * in the transcript as one enormous employee turn. Such a scenario is still
   * fine to *score* — the harness measures what the arm actually did — but as a
   * demonstration it would burn thousands of tokens on every judge call
   * thereafter and teach nothing. Truncating would corrupt the example, so the
   * scenario is skipped instead and the count reported.
   */
  maxDemoTranscriptChars?: number;
  seed?: number;
  onProgress?: (message: string) => void;
}

export interface AxFewShotResult {
  param: PromptSlotParam;
  /** Seed instruction plus the rendered few-shot block. */
  prompt: string;
  /** Instruction on its own, so the caller can report what was added. */
  seed: string;
  demoCount: number;
  /** Fixtures whose transcripts became demos. */
  demoFixtureIds: string[];
  /** Ax's own best score on its metric — a sanity signal, not a result. */
  bootstrapScore: number;
  trainSize: number;
  validationSize: number;
  /** Scenarios excluded for having an unusably long transcript. */
  skippedSamples: number;
}

/**
 * Build a few-shot judge prompt from the labelled corpus.
 *
 * The returned prompt is a *candidate*, exactly like GEPA's. It proves nothing
 * on its own: the score that matters comes from running it against the control
 * arm through `runEvaluation`, which is what the CLI does next.
 */
export async function bootstrapJudgePrompt(
  options: AxFewShotOptions,
): Promise<AxFewShotResult> {
  const maxDemos = Math.max(1, options.maxDemos ?? 3);
  const seed = options.seed ?? 20260812;
  const maxTranscriptChars = options.maxDemoTranscriptChars ?? 2000;

  const usable = options.samples.filter(
    (sample) => sample.transcript.length <= maxTranscriptChars,
  );
  const skipped = options.samples.length - usable.length;
  if (skipped > 0) {
    options.onProgress?.(
      `пропущено сценариев с чрезмерно длинной расшифровкой: ${skipped} из ${options.samples.length} (порог ${maxTranscriptChars} символов)`,
    );
  }

  // Deterministic shuffle: the same corpus and seed must select the same
  // demos, otherwise two runs of the optimiser are not comparable.
  const shuffled = [...usable].sort(
    (a, b) =>
      hash32(`${seed}:${a.fixtureId}`) - hash32(`${seed}:${b.fixtureId}`),
  );
  const splitAt = Math.max(
    1,
    Math.floor(shuffled.length * (options.trainSplit ?? 0.7)),
  );
  const train = shuffled.slice(0, splitAt);
  const validation = shuffled.slice(splitAt);

  if (train.length === 0) {
    throw new Error(
      skipped > 0
        ? `Ни одна расшифровка не уложилась в ${maxTranscriptChars} символов. Поднимите --max-demo-chars или пересоберите корпус на модели, которая не выдаёт рассуждения в реплику (--refresh-corpus).`
        : "Корпус пуст: нечего использовать для бутстрапа примеров.",
    );
  }

  const isStyle = options.slot.name === "style";
  const program = ax(isStyle ? styleSignature : criteriaSignature);
  // The seed instruction is the *same* text the production judge runs with, so
  // demos are collected under the prompt they will be attached to rather than
  // under Ax's generic framing.
  program.setInstruction(options.slot.seed);

  const examples = train.map((sample) =>
    isStyle ? styleExample(sample) : criteriaExample(sample),
  );
  const validationExamples = validation.map((sample) =>
    isStyle ? styleExample(sample) : criteriaExample(sample),
  );

  const optimizer = new AxBootstrapFewShot({
    studentAI: options.client,
    teacherAI: options.teacherClient,
    seed,
    onProgress: (progress) =>
      options.onProgress?.(
        `раунд ${progress.round}/${progress.totalRounds}: лучший ${progress.bestScore.toFixed(3)} (успешных ${progress.successfulExamples}/${progress.totalExamples})`,
      ),
    options: {
      maxDemos,
      maxRounds: options.maxRounds ?? 3,
      maxExamples: examples.length,
      // A trace only becomes a demo if it fully agrees with the expert on
      // style, or is close on criteria. Anything looser teaches the judge the
      // mistakes the harness is trying to measure.
      qualityThreshold: isStyle ? 1 : 0.8,
    },
  });

  // Ax throws when no trace cleared the quality threshold. That is a
  // legitimate outcome on a weak model, not a crash: it means the judge cannot
  // reproduce the expert labelling at all, and few-shot is the wrong lever.
  // The caller gets a zero-demo result and can say so.
  let result: AxOptimizerResult<AxGenOut> | undefined;
  try {
    result = await optimizer.compile(
      program,
      examples,
      isStyle ? styleMetric : criteriaMetric,
      {
        maxDemos,
        validationExamples:
          validationExamples.length > 0 ? validationExamples : undefined,
      },
    );
  } catch (cause) {
    options.onProgress?.(
      `бутстрап не собрал ни одного примера: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const traces = (result?.demos ?? [])
    .flatMap((demo) => demo.traces as Record<string, unknown>[])
    .filter(
      (trace) =>
        typeof trace.transcript !== "string" ||
        trace.transcript.length <= maxTranscriptChars,
    )
    .slice(0, maxDemos);

  const byTranscript = new Map(
    options.samples.map((sample) => [sample.transcript, sample]),
  );

  const blocks: string[] = [];
  const demoFixtureIds: string[] = [];

  for (const [index, trace] of traces.entries()) {
    const transcript =
      typeof trace.transcript === "string" ? trace.transcript : undefined;
    if (!transcript) continue;

    const sample = byTranscript.get(transcript);
    const verdict = isStyle
      ? renderStyleDemo(trace)
      : renderCriteriaDemo(trace);

    blocks.push(
      [
        `### Пример ${index + 1}`,
        "Расшифровка:",
        transcript,
        ...(isStyle
          ? []
          : [`Критерии для проверки:\n${sample?.criteriaList ?? ""}`]),
        "Правильная разметка:",
        verdict,
      ].join("\n"),
    );
    if (sample) demoFixtureIds.push(sample.fixtureId);
  }

  // `criteriaAssessmentSchema` requires a `comment` on every criterion, but the
  // demos carry none: there is no reference wording to bootstrap from. Without
  // this line the examples quietly teach the judge to drop the field, and the
  // call then fails schema validation — the demos would be actively harmful.
  const contractNote =
    isStyle || blocks.every((block) => block.includes('"comment"'))
      ? []
      : [
          "В примерах поле comment опущено для краткости. В своём ответе заполняй его для каждого критерия.",
        ];

  const prompt =
    blocks.length === 0
      ? options.slot.seed
      : [
          options.slot.seed,
          "",
          "Ниже — размеченные примеры, сверенные с оценкой эксперта. Разбирай новую расшифровку так же.",
          ...contractNote,
          "",
          blocks.join("\n\n"),
        ].join("\n");

  return {
    param: options.slot.param,
    prompt,
    seed: options.slot.seed,
    demoCount: blocks.length,
    demoFixtureIds,
    bootstrapScore: result?.bestScore ?? 0,
    trainSize: train.length,
    validationSize: validation.length,
    skippedSamples: skipped,
  };
}

/** Stable 32-bit hash, used only to order the corpus reproducibly. */
function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
