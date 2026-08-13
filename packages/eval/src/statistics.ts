/**
 * Statistics for A/B comparison of pipeline variants.
 *
 * Every arm runs the *same* fixtures, so the comparison is paired: the
 * difference is computed per fixture and only then averaged. That removes
 * fixture difficulty from the variance and is what makes a 3-point gap on a
 * few dozen scenarios interpretable at all — an unpaired comparison on this
 * sample size would happily "confirm" pure noise.
 */

/**
 * Below this many paired observations, a bootstrap CI is not evidence.
 *
 * At `pairs === 1` every resample draws the same single difference, so the
 * interval collapses onto that one point and "excludes zero" trivially,
 * whatever the true effect is — the check would call a coin flip significant.
 * A handful of pairs is not much better: too few distinct values for the
 * resampling to explore real variance. Refusing to call anything significant
 * below this floor is what keeps a thin run from reporting a false "лучше".
 */
const MIN_PAIRS_FOR_SIGNIFICANCE = 5;

/** Deterministic PRNG so a report can be reproduced exactly. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PairedComparison {
  /** Mean of (baseline − candidate) per fixture. Positive ⇒ candidate better. */
  delta: number;
  ciLow: number;
  ciHigh: number;
  /** Two-sided p-value from a paired permutation test. */
  pValue: number;
  /** Number of paired observations. */
  pairs: number;
  /** True when the 95% CI excludes zero. */
  significant: boolean;
}

export interface PairedInput {
  /** Metric value for the reference arm, keyed by fixture. */
  baseline: Map<string, number>;
  /** Metric value for the arm under test, keyed by fixture. */
  candidate: Map<string, number>;
  /** `lower` for error-like metrics (MAE), `higher` for accuracy-like ones. */
  direction: "lower" | "higher";
  iterations?: number;
  seed?: number;
}

/**
 * Paired percentile bootstrap + paired permutation test.
 *
 * Bootstrap gives the confidence interval, the permutation test gives the
 * p-value; both resample the *same* per-fixture differences, so they answer
 * the same question and cannot disagree about direction.
 */
export function comparePaired(input: PairedInput): PairedComparison {
  const iterations = input.iterations ?? 10_000;
  const random = mulberry32(input.seed ?? 20260811);

  // "Improvement" is always positive, whichever way the metric points.
  const differences: number[] = [];
  for (const [fixtureId, baselineValue] of input.baseline) {
    const candidateValue = input.candidate.get(fixtureId);
    if (candidateValue === undefined) continue;
    differences.push(
      input.direction === "lower"
        ? baselineValue - candidateValue
        : candidateValue - baselineValue,
    );
  }

  const pairs = differences.length;
  if (pairs === 0) {
    return {
      delta: 0,
      ciLow: 0,
      ciHigh: 0,
      pValue: 1,
      pairs: 0,
      significant: false,
    };
  }

  const delta = mean(differences);

  const bootstrapped: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0;
    for (let j = 0; j < pairs; j += 1) {
      sum += differences[Math.floor(random() * pairs)] ?? 0;
    }
    bootstrapped.push(sum / pairs);
  }
  bootstrapped.sort((a, b) => a - b);

  // Sign-flipping permutation: under the null the sign of each paired
  // difference is arbitrary, which is the exact null for a paired design.
  let atLeastAsExtreme = 0;
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0;
    for (const difference of differences) {
      sum += random() < 0.5 ? difference : -difference;
    }
    if (Math.abs(sum / pairs) >= Math.abs(delta)) atLeastAsExtreme += 1;
  }

  const ciLow = percentile(bootstrapped, 0.025);
  const ciHigh = percentile(bootstrapped, 0.975);

  return {
    delta: round(delta),
    ciLow: round(ciLow),
    ciHigh: round(ciHigh),
    // +1 in both parts: the observed assignment is itself a valid permutation,
    // which keeps the p-value from ever being reported as exactly 0.
    pValue: round((atLeastAsExtreme + 1) / (iterations + 1), 4),
    pairs,
    significant:
      pairs >= MIN_PAIRS_FOR_SIGNIFICANCE && (ciLow > 0 || ciHigh < 0),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(q * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Cohen's κ between the automatic verdict and the expert label.
 *
 * Raw agreement badly overstates a judge on skewed label distributions —
 * chance-corrected agreement is the honest number, and the systematic
 * evaluation of LLM judges reports 30–40 pp gaps between the two. Reported
 * alongside accuracy so the gap itself stays visible.
 */
export function cohensKappa(
  pairs: { predicted: string; actual: string }[],
): number {
  if (pairs.length === 0) return 0;

  const labels = new Set<string>();
  for (const pair of pairs) {
    labels.add(pair.predicted);
    labels.add(pair.actual);
  }

  const observed =
    pairs.filter((pair) => pair.predicted === pair.actual).length /
    pairs.length;

  let expected = 0;
  for (const label of labels) {
    const predictedShare =
      pairs.filter((pair) => pair.predicted === label).length / pairs.length;
    const actualShare =
      pairs.filter((pair) => pair.actual === label).length / pairs.length;
    expected += predictedShare * actualShare;
  }

  if (expected >= 1) return observed >= 1 ? 1 : 0;
  return round((observed - expected) / (1 - expected));
}

/** Verbal reading of κ, so the report does not require a stats background. */
export function kappaLabel(kappa: number): string {
  if (kappa >= 0.81) return "почти полное";
  if (kappa >= 0.61) return "существенное";
  if (kappa >= 0.41) return "умеренное";
  if (kappa >= 0.21) return "слабое";
  if (kappa > 0) return "незначительное";
  return "не лучше случайного";
}
