import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCandidateArms,
  loadPromptArtifact,
  PROMPT_ARTIFACT_VERSION,
  type PromptArtifact,
  writePromptArtifact,
} from "./artifact";

function artifact(
  overrides: Partial<PromptArtifact> = {},
): Omit<PromptArtifact, "version" | "createdAt"> {
  return {
    optimizer: "gepa",
    slot: "roleRules",
    variantId: "baseline-judge",
    prompt: "Новая инструкция персонажа.",
    ...overrides,
  };
}

describe("writePromptArtifact / loadPromptArtifact", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ax-artifact-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("round-trips a written artefact", async () => {
    const path = join(dir, "persona.json");
    await writePromptArtifact(path, artifact());

    const loaded = await loadPromptArtifact(path);

    expect(loaded.optimizer).toBe("gepa");
    expect(loaded.slot).toBe("roleRules");
    expect(loaded.prompt).toBe("Новая инструкция персонажа.");
    expect(loaded.version).toBe(PROMPT_ARTIFACT_VERSION);
    // The write path is what stamps `createdAt` — a round-trip must not lose it.
    expect(typeof loaded.createdAt).toBe("string");
  });

  test("rejects a missing file with a message naming the path, not a raw ENOENT", async () => {
    const path = join(dir, "does-not-exist.json");
    await expect(loadPromptArtifact(path)).rejects.toThrow(/не найден/);
  });

  test("rejects a file that is not valid JSON", async () => {
    const path = join(dir, "broken.json");
    await Bun.write(path, "{ not json");
    await expect(loadPromptArtifact(path)).rejects.toThrow(/не является JSON/);
  });

  test("rejects a payload missing a required field", async () => {
    const path = join(dir, "incomplete.json");
    await Bun.write(path, JSON.stringify({ optimizer: "gepa" }));
    await expect(loadPromptArtifact(path)).rejects.toThrow(
      /не соответствует формату/,
    );
  });

  test("rejects an artefact from a newer format version", async () => {
    const path = join(dir, "future.json");
    await Bun.write(
      path,
      JSON.stringify({
        ...artifact(),
        version: PROMPT_ARTIFACT_VERSION + 1,
      }),
    );
    await expect(loadPromptArtifact(path)).rejects.toThrow(/версии/);
  });
});

describe("buildCandidateArms", () => {
  test("returns nothing for an empty artefact list", () => {
    expect(buildCandidateArms([])).toEqual([]);
  });

  test("builds one arm per artefact by default, each against its control", () => {
    const arms = buildCandidateArms([
      { ...artifact({ slot: "roleRules" }), version: 1, createdAt: null },
      {
        ...artifact({
          slot: "styleJudgeSystem",
          optimizer: "ax-bootstrap-few-shot",
        }),
        version: 1,
        createdAt: null,
      },
    ]);

    expect(arms).toHaveLength(2);
    for (const arm of arms) {
      expect(arm.referenceVariantId).toBe("baseline-judge");
      expect(arm.candidate.id).not.toBe("baseline-judge");
      // Only the optimised slot changes — every other field carries over from
      // the control variant, which is what makes the comparison isolated.
      expect(arm.candidate.knowledge).toBe("prompt-baseline");
      expect(arm.candidate.evaluation).toBe("llm-judge");
    }

    expect(arms[0]?.candidate.params.roleRules).toBe(
      "Новая инструкция персонажа.",
    );
    expect(arms[1]?.candidate.params.styleJudgeSystem).toBe(
      "Новая инструкция персонажа.",
    );
    // Each arm must only carry the slot it was built from — a leaked param
    // from the other artefact would silently change what is being measured.
    expect(arms[0]?.candidate.params.styleJudgeSystem).toBeUndefined();
    expect(arms[1]?.candidate.params.roleRules).toBeUndefined();
  });

  test("--combine merges every artefact's slot into a single arm", () => {
    const arms = buildCandidateArms(
      [
        { ...artifact({ slot: "roleRules" }), version: 1, createdAt: null },
        {
          ...artifact({
            slot: "criteriaJudgeSystem",
            prompt: "Инструкция судье по критериям.",
          }),
          version: 1,
          createdAt: null,
        },
      ],
      { combine: true },
    );

    expect(arms).toHaveLength(1);
    const [arm] = arms;
    expect(arm?.candidate.params.roleRules).toBe("Новая инструкция персонажа.");
    expect(arm?.candidate.params.criteriaJudgeSystem).toBe(
      "Инструкция судье по критериям.",
    );
    expect(arm?.provenance).toContain("roleRules");
    expect(arm?.provenance).toContain("criteriaJudgeSystem");
  });

  test("rejects artefacts built on different base variants", () => {
    expect(() =>
      buildCandidateArms([
        {
          ...artifact({ variantId: "baseline-judge" }),
          version: 1,
          createdAt: null,
        },
        {
          ...artifact({ variantId: "llm-first" }),
          version: 1,
          createdAt: null,
        },
      ]),
    ).toThrow(/разных базовых вариантах/);
  });

  test("rejects combining two artefacts that write the same slot", () => {
    expect(() =>
      buildCandidateArms(
        [
          {
            ...artifact({ slot: "roleRules", prompt: "A" }),
            version: 1,
            createdAt: null,
          },
          {
            ...artifact({ slot: "roleRules", prompt: "B" }),
            version: 1,
            createdAt: null,
          },
        ],
        { combine: true },
      ),
    ).toThrow(/один слот/);
  });

  test("candidate ids stay within the 64-character variant id limit", () => {
    const arms = buildCandidateArms([
      {
        ...artifact({
          variantId: "baseline-judge",
          slot: "criteriaJudgeSystem",
        }),
        version: 1,
        createdAt: null,
      },
    ]);

    expect(arms[0]?.candidate.id.length).toBeLessThanOrEqual(64);
  });
});
