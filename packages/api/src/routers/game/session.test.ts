import { describe, expect, it } from "bun:test";

import { selectWeightedVariant } from "./session";

describe("selectWeightedVariant", () => {
  const variants = [
    { id: "control", weight: 1 },
    { id: "experiment", weight: 3 },
  ];

  it("uses the configured weight boundaries", () => {
    expect(selectWeightedVariant(variants, () => 0)).toBe("control");
    expect(selectWeightedVariant(variants, () => 0.249)).toBe("control");
    expect(selectWeightedVariant(variants, () => 0.25)).toBe("experiment");
    expect(selectWeightedVariant(variants, () => 0.999)).toBe("experiment");
  });

  it("ignores disabled weights and returns undefined for an empty split", () => {
    expect(
      selectWeightedVariant(
        [
          { id: "off", weight: 0 },
          { id: "on", weight: 2 },
        ],
        () => 0,
      ),
    ).toBe("on");
    expect(selectWeightedVariant([{ id: "off", weight: 0 }])).toBeUndefined();
  });
});
