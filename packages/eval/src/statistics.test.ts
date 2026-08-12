import { describe, expect, test } from "bun:test";

import { cohensKappa, comparePaired } from "./statistics";

function series(values: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(values));
}

describe("comparePaired", () => {
  test("a consistent improvement on an error metric is significant", () => {
    const baseline = series({ a: 30, b: 28, c: 35, d: 31, e: 29, f: 33 });
    const candidate = series({ a: 12, b: 10, c: 15, d: 13, e: 11, f: 14 });

    const result = comparePaired({ baseline, candidate, direction: "lower" });

    expect(result.delta).toBeGreaterThan(0);
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.pairs).toBe(6);
  });

  test("a small gap on few noisy fixtures is not endorsed", () => {
    // This is the case that matters: eyeballing the means suggests the
    // candidate "wins", but the per-fixture differences flip sign.
    const baseline = series({ a: 20, b: 5, c: 30, d: 10 });
    const candidate = series({ a: 5, b: 25, c: 12, d: 20 });

    const result = comparePaired({ baseline, candidate, direction: "lower" });

    expect(result.significant).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  test("direction is respected for accuracy-like metrics", () => {
    const baseline = series({ a: 0.5, b: 0.5, c: 0.5, d: 0.5, e: 0.5 });
    const candidate = series({ a: 0.9, b: 0.9, c: 0.9, d: 0.9, e: 0.9 });

    const higher = comparePaired({ baseline, candidate, direction: "higher" });
    const lower = comparePaired({ baseline, candidate, direction: "lower" });

    expect(higher.delta).toBeGreaterThan(0);
    expect(lower.delta).toBeLessThan(0);
  });

  test("is deterministic for a given seed", () => {
    const baseline = series({ a: 10, b: 20, c: 30 });
    const candidate = series({ a: 8, b: 25, c: 24 });

    const first = comparePaired({ baseline, candidate, direction: "lower" });
    const second = comparePaired({ baseline, candidate, direction: "lower" });

    expect(second).toEqual(first);
  });

  test("fixtures missing from one arm are dropped, not counted as zero", () => {
    const baseline = series({ a: 10, b: 20, c: 30 });
    const candidate = series({ a: 5, b: 10 });

    expect(
      comparePaired({ baseline, candidate, direction: "lower" }).pairs,
    ).toBe(2);
  });
});

describe("cohensKappa", () => {
  test("perfect agreement is 1", () => {
    expect(
      cohensKappa([
        { predicted: "directive", actual: "directive" },
        { predicted: "delegating", actual: "delegating" },
      ]),
    ).toBe(1);
  });

  test("chance-level agreement on a skewed distribution is near zero", () => {
    // The judge always says "directive" and 80% of labels are "directive":
    // 80% raw accuracy, but no skill whatsoever.
    const pairs = Array.from({ length: 10 }, (_, index) => ({
      predicted: "directive",
      actual: index < 8 ? "directive" : "delegating",
    }));

    expect(cohensKappa(pairs)).toBe(0);
  });

  test("kappa is lower than raw accuracy on skewed labels", () => {
    const pairs = [
      ...Array.from({ length: 7 }, () => ({
        predicted: "directive",
        actual: "directive",
      })),
      { predicted: "directive", actual: "delegating" },
      { predicted: "delegating", actual: "delegating" },
      { predicted: "coaching", actual: "coaching" },
    ];

    const accuracy =
      pairs.filter((pair) => pair.predicted === pair.actual).length /
      pairs.length;

    expect(cohensKappa(pairs)).toBeLessThan(accuracy);
  });
});
