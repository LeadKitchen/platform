import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  resolveVariant,
  type VariantConfig,
  variantConfigSchema,
} from "@acme/ai";
import { z } from "zod";

/**
 * The hand-off between an optimiser and the benchmark.
 *
 * Both optimisers used to end with "now paste this into `params` and run eval
 * yourself". That manual step is where a comparison quietly stops being a
 * comparison: it is far too easy to score the candidate against a control arm
 * that is not actually the control. A single declared artefact format lets
 * `eval --candidate` build both arms from one file, so the only thing that
 * differs between them is the prompt under test.
 */
export const PROMPT_ARTIFACT_VERSION = 1;

export const PROMPT_SLOT_PARAMS = [
  "roleRules",
  "styleJudgeSystem",
  "criteriaJudgeSystem",
] as const;

export const promptArtifactSchema = z.object({
  version: z.number().int().default(PROMPT_ARTIFACT_VERSION),
  /** Which optimiser produced this, for the report and for provenance. */
  optimizer: z.string().min(1),
  /** Variant parameter the prompt belongs in. */
  slot: z.enum(PROMPT_SLOT_PARAMS),
  /** Variant the optimiser ran the pipeline as — and the control arm. */
  variantId: z.string().min(1),
  prompt: z.string().min(1),
  createdAt: z.string().nullish(),
  /**
   * The optimiser's own numbers.
   *
   * Kept for provenance only. They come from a single pass inside the
   * optimiser's own split, which is exactly the thing `eval --runs 3` exists to
   * replace — never quote them as the result.
   */
  seedScore: z.number().nullish(),
  bestScore: z.number().nullish(),
  rationale: z.string().nullish(),
  demoCount: z.number().int().nullish(),
  demoFixtureIds: z.array(z.string()).nullish(),
  bootstrapScore: z.number().nullish(),
});

export type PromptArtifact = z.infer<typeof promptArtifactSchema>;

export async function writePromptArtifact(
  path: string,
  artifact: Omit<PromptArtifact, "version" | "createdAt">,
): Promise<void> {
  const payload: PromptArtifact = promptArtifactSchema.parse({
    ...artifact,
    version: PROMPT_ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
  });

  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(payload, null, 2), "utf8");
}

export async function loadPromptArtifact(
  path: string,
): Promise<PromptArtifact> {
  const target = resolve(path);
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch {
    throw new Error(`Артефакт промпта не найден: ${target}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `Артефакт промпта ${target} не является JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const result = promptArtifactSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Артефакт промпта ${target} не соответствует формату:\n${result.error.issues
        .map(
          (issue) =>
            `  ${issue.path.join(".") || "(корень)"}: ${issue.message}`,
        )
        .join("\n")}`,
    );
  }

  if (result.data.version > PROMPT_ARTIFACT_VERSION) {
    throw new Error(
      `Артефакт ${target} версии ${result.data.version}, а этот код понимает только ${PROMPT_ARTIFACT_VERSION}.`,
    );
  }

  return result.data;
}

/** Short, stable tag for a slot, used to build readable candidate ids. */
const SLOT_TAG: Record<(typeof PROMPT_SLOT_PARAMS)[number], string> = {
  roleRules: "persona",
  styleJudgeSystem: "style",
  criteriaJudgeSystem: "criteria",
};

function candidateId(baseId: string, tags: string[]): string {
  const suffix = `__${tags.join("+")}`;
  // `variantConfigSchema` caps ids at 64 characters, and a variant id that
  // fails validation here would surface as a confusing error deep inside the
  // runner instead of at the point the arm was built.
  return `${baseId.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
}

export interface CandidateArm {
  /** Arm carrying the optimised prompt(s). */
  candidate: VariantConfig;
  /** Untouched arm the candidate must be compared against. */
  referenceVariantId: string;
  /** Human-readable provenance line for the run header. */
  provenance: string;
}

/**
 * Build one arm per artefact, or a single arm carrying all of them.
 *
 * Combining is how several single-slot optimisation runs add up to a joint
 * result: GEPA rewrites `roleRules`, the Ax bootstrapper adds demos to both
 * judge prompts, and `--combine` measures the three together. Optimising them
 * jointly would be better still, but measuring the composition is what tells
 * you whether it is worth the effort.
 */
export function buildCandidateArms(
  artifacts: PromptArtifact[],
  options: { combine?: boolean; extraVariants?: VariantConfig[] } = {},
): CandidateArm[] {
  if (artifacts.length === 0) return [];

  const variantIds = new Set(artifacts.map((artifact) => artifact.variantId));
  if (variantIds.size > 1) {
    throw new Error(
      `Артефакты собраны на разных базовых вариантах (${[...variantIds].join(", ")}). ` +
        "Сравнивать их в одном прогоне нельзя: изменится не только промпт.",
    );
  }

  const baseId = artifacts[0]?.variantId ?? "";
  const base = resolveVariant(baseId, options.extraVariants);

  const toArm = (group: PromptArtifact[]): CandidateArm => {
    const slots = group.map((artifact) => artifact.slot);
    const duplicate = slots.find(
      (slot, index) => slots.indexOf(slot) !== index,
    );
    if (duplicate) {
      throw new Error(
        `Два артефакта пишут в один слот "${duplicate}". Оставьте один или сравните их отдельными прогонами.`,
      );
    }

    const params = { ...base.params };
    for (const artifact of group) params[artifact.slot] = artifact.prompt;

    return {
      candidate: variantConfigSchema.parse({
        ...base,
        id: candidateId(
          base.id,
          group.map((artifact) => SLOT_TAG[artifact.slot]),
        ),
        name: `${base.name} + ${group.map((artifact) => `${SLOT_TAG[artifact.slot]}/${artifact.optimizer}`).join(", ")}`,
        description: `Кандидат оптимизатора. Базовый вариант ${base.id}; изменены только параметры: ${slots.join(", ")}.`,
        params,
      }),
      referenceVariantId: base.id,
      provenance: group
        .map(
          (artifact) =>
            `${artifact.slot} ← ${artifact.optimizer}${artifact.createdAt ? ` (${artifact.createdAt})` : ""}`,
        )
        .join("; "),
    };
  };

  return options.combine
    ? [toArm(artifacts)]
    : artifacts.map((artifact) => toArm([artifact]));
}
