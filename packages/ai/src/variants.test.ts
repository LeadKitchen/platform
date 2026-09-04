import { describe, expect, test } from "bun:test";

import { stageParamsSchema } from "./types";
import { variantConfigSchema } from "./variants";

const validVariant = {
  id: "test",
  name: "Test",
  knowledge: "prompt-baseline",
  persona: "prompt-baseline",
  evaluation: "rules",
};

describe("strategy numeric parameters", () => {
  test("accepts finite non-negative integer topK and pool values", () => {
    expect(stageParamsSchema.parse({ topK: 0, pool: 3 })).toMatchObject({
      topK: 0,
      pool: 3,
    });
    expect(
      variantConfigSchema.parse({
        ...validVariant,
        params: { topK: 6, pool: 18 },
      }).params,
    ).toMatchObject({ topK: 6, pool: 18 });
  });

  test("rejects negative, NaN, infinite, and fractional topK and pool values", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      for (const key of ["topK", "pool"] as const) {
        expect(stageParamsSchema.safeParse({ [key]: value }).success).toBe(
          false,
        );
        expect(
          variantConfigSchema.safeParse({
            ...validVariant,
            params: { [key]: value },
          }).success,
        ).toBe(false);
      }
    }
  });
});
