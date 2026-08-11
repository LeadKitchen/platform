import {
  type CompetenceState,
  type EmployeeLevel,
  MANAGEMENT_STYLES,
  type ManagementStyle,
  type StyleDistribution,
} from "./types";

/** Russian labels for the administrator UI. */
export const STYLE_LABELS: Record<ManagementStyle, string> = {
  directive: "Директивный",
  coaching: "Наставнический",
  supporting: "Поддерживающий",
  delegating: "Делегирующий",
};

export const LEVEL_LABELS: Record<EmployeeLevel, string> = {
  L1: "L1 — не умеет, не уверен",
  L2: "L2 — учится, нужна поддержка и обучение",
  L3: "L3 — умеет, но не всегда уверен",
  L4: "L4 — умеет и берёт ответственность",
};

export const COMPETENCE_LABELS: Record<CompetenceState, string> = {
  novice: "новая задача",
  learning: "осваивает",
  capable: "уверенно делает",
  expert: "эксперт",
};

/** Position of a style on the "structure → autonomy" axis (0…3). */
export function styleIndex(style: ManagementStyle): number {
  return MANAGEMENT_STYLES.indexOf(style);
}

export function styleFromIndex(index: number): ManagementStyle {
  const clamped = Math.min(MANAGEMENT_STYLES.length - 1, Math.max(0, index));
  // `clamped` is inside the tuple bounds, so the lookup always resolves.
  return MANAGEMENT_STYLES[clamped] ?? "directive";
}

/**
 * Partial credit for choosing `actual` when `expected` was correct.
 *
 * The matrix is deliberately asymmetric. Under-managing (being *more* hands-off
 * than the situation calls for) is the failure the game is about — an
 * unsupervised novice ruins the order — so it is punished harder than
 * over-managing, which mostly costs motivation.
 */
const UNDER_MANAGEMENT_CREDIT = [1, 0.4, 0.15, 0];
const OVER_MANAGEMENT_CREDIT = [1, 0.6, 0.3, 0.1];

export function styleCredit(
  expected: ManagementStyle,
  actual: ManagementStyle,
): number {
  const distance = Math.abs(styleIndex(expected) - styleIndex(actual));
  const table =
    styleIndex(actual) > styleIndex(expected)
      ? UNDER_MANAGEMENT_CREDIT
      : OVER_MANAGEMENT_CREDIT;
  return table[distance] ?? 0;
}

/** Credit for a whole distribution (the "s1 = x%, s2 = y%" breakdown). */
export function weightedStyleCredit(
  expected: ManagementStyle,
  distribution: StyleDistribution,
): number {
  const total = MANAGEMENT_STYLES.reduce(
    (sum, style) => sum + Math.max(0, distribution[style]),
    0,
  );
  if (total <= 0) return 0;

  const credit = MANAGEMENT_STYLES.reduce(
    (sum, style) =>
      sum + Math.max(0, distribution[style]) * styleCredit(expected, style),
    0,
  );
  return credit / total;
}

export function emptyStyleDistribution(): StyleDistribution {
  return { directive: 0, coaching: 0, supporting: 0, delegating: 0 };
}

export function normalizeStyleDistribution(
  distribution: Partial<StyleDistribution>,
): StyleDistribution {
  const filled = { ...emptyStyleDistribution(), ...distribution };
  const total = MANAGEMENT_STYLES.reduce(
    (sum, style) => sum + Math.max(0, filled[style]),
    0,
  );
  if (total <= 0) return emptyStyleDistribution();

  const normalized = emptyStyleDistribution();
  for (const style of MANAGEMENT_STYLES) {
    normalized[style] = Math.max(0, filled[style]) / total;
  }
  return normalized;
}

export function dominantStyle(
  distribution: StyleDistribution,
): ManagementStyle {
  let best: ManagementStyle = "directive";
  for (const style of MANAGEMENT_STYLES) {
    if (distribution[style] > distribution[best]) best = style;
  }
  return best;
}
