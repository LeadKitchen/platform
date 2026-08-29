import {
  and,
  type Database,
  eq,
  GameScorecard,
  type GameScorecardCategory,
  type GameScorecardSnapshot,
} from "@acme/db";
import { CRITERIA, type Criterion, type CriterionId } from "@acme/game";

export interface ScorecardTemplate {
  id: string;
  name: string;
  description: string;
  categories: GameScorecardCategory[];
}

function category(
  id: string,
  name: string,
  criterionIds: CriterionId[],
): GameScorecardCategory {
  return {
    id,
    name,
    weight: 100,
    criteria: criterionIds.map((criterionId) => ({
      criterionId,
      title: CRITERIA[criterionId].title,
      description: "AI проверяет, проявилось ли это действие в разговоре.",
      weight: CRITERIA[criterionId].weight,
      required: true,
      scoring: "percent",
    })),
  };
}

export const SCORECARD_TEMPLATES: ScorecardTemplate[] = [
  {
    id: "task-setting",
    name: "Постановка задачи",
    description: "Ясность результата, срок, способ выполнения и контроль.",
    categories: [
      category("task", "Постановка задачи", [
        "clarify_task",
        "set_deadline",
        "explain_how",
        "set_checkpoints",
        "check_understanding",
      ]),
    ],
  },
  {
    id: "supportive",
    name: "Поддерживающий разговор",
    description: "Вовлечение сотрудника, мотивация и доступные ресурсы.",
    categories: [
      category("support", "Поддержка", [
        "ask_opinion",
        "motivate",
        "offer_help",
        "check_understanding",
      ]),
    ],
  },
  {
    id: "delegation",
    name: "Делегирование результата",
    description: "Ответственность без микроменеджмента и ясные границы.",
    categories: [
      category("delegation", "Делегирование", [
        "clarify_task",
        "set_deadline",
        "delegate_authority",
        "avoid_micromanagement",
      ]),
    ],
  },
  {
    id: "overload",
    name: "Работа с перегрузом",
    description: "Приоритеты, реалистичный объём и помощь в пиковой нагрузке.",
    categories: [
      category("overload", "Управление нагрузкой", [
        "prioritize",
        "reduce_scope",
        "offer_help",
        "set_deadline",
      ]),
    ],
  },
];

export const SYSTEM_SCORECARD = {
  id: "system" as const,
  source: "system" as const,
  name: "Адаптивное руководство",
  description:
    "Система сама выбирает критерии по уровню сотрудника, новизне задачи и нагрузке.",
  criteriaCount: Object.keys(CRITERIA).length,
};

export function scorecardSnapshot(row: {
  id: string;
  name: string;
  description: string;
  categories: GameScorecardCategory[];
}): GameScorecardSnapshot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    categories: row.categories,
  };
}

export function scorecardCriteria(
  snapshot: GameScorecardSnapshot,
): Criterion[] {
  return snapshot.categories.flatMap((item) => {
    const required = item.criteria.filter((criterion) => criterion.required);
    const total = required.reduce(
      (sum, criterion) => sum + criterion.weight,
      0,
    );
    return required.map((criterion) => ({
      id: criterion.criterionId as CriterionId,
      title: criterion.title,
      description: [
        criterion.description,
        criterion.condition ? `Условие: ${criterion.condition}` : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      // Category weights become actual evaluator weights, normalized inside
      // each category so a category with more criteria does not dominate.
      weight: (item.weight * criterion.weight) / Math.max(1, total),
    }));
  });
}

/** Null means the scenario-aware system rubric remains active. */
export async function getActiveScorecardSnapshot(
  db: Database,
  orgId: string | null,
): Promise<GameScorecardSnapshot | null> {
  if (!orgId) return null;
  const [row] = await db
    .select()
    .from(GameScorecard)
    .where(
      and(
        eq(GameScorecard.orgId, orgId),
        eq(GameScorecard.isActive, true),
        eq(GameScorecard.isArchived, false),
      ),
    )
    .limit(1);
  return row ? scorecardSnapshot(row) : null;
}
