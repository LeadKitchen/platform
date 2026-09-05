import type { Evaluation } from "@acme/game";

export interface CounterfactualComparison {
  scoreDelta: number;
  verdict: "improved" | "unchanged" | "worse";
  newlyMet: Array<{ id: string; title: string }>;
  noLongerMet: Array<{ id: string; title: string }>;
  styleChanged: boolean;
  outcomeChanged: boolean;
}

export function sameUtterance(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("ru");
  return normalize(left) === normalize(right);
}

export function compareEvaluations(
  original: Evaluation,
  projected: Evaluation,
): CounterfactualComparison {
  const originalCriteria = new Map(
    original.criteria.map((criterion) => [criterion.id, criterion.met]),
  );
  const projectedCriteria = new Map(
    projected.criteria.map((criterion) => [criterion.id, criterion.met]),
  );
  const newlyMet = projected.criteria
    .filter(
      (criterion) =>
        criterion.met && originalCriteria.get(criterion.id) !== true,
    )
    .map(({ id, title }) => ({ id, title }));
  const noLongerMet = original.criteria
    .filter(
      (criterion) =>
        criterion.met && projectedCriteria.get(criterion.id) !== true,
    )
    .map(({ id, title }) => ({ id, title }));
  const scoreDelta = projected.scorePercent - original.scorePercent;

  return {
    scoreDelta,
    verdict:
      scoreDelta > 0 ? "improved" : scoreDelta < 0 ? "worse" : "unchanged",
    newlyMet,
    noLongerMet,
    styleChanged: original.actualStyle !== projected.actualStyle,
    outcomeChanged:
      original.outcome.status !== projected.outcome.status ||
      original.outcome.onTime !== projected.outcome.onTime ||
      original.outcome.motivationDelta !== projected.outcome.motivationDelta,
  };
}
