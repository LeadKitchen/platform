import {
  type Database,
  eq,
  GameRoleplayScenario,
  type GameRoleplayScenarioSnapshot,
} from "@acme/db";
import type {
  Catalog,
  CompetenceState,
  Employee,
  EmployeeLevel,
  Task,
} from "@acme/game";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

export const ROLEPLAY_CATEGORIES = [
  "tasking",
  "feedback",
  "resistance",
  "overload",
  "delegation",
] as const;

export type RoleplayCategory = (typeof ROLEPLAY_CATEGORIES)[number];
export type RoleplayMode = "full" | "objections";

export interface RoleplayScenario {
  id: string;
  source: "template" | "custom";
  title: string;
  baseEmployeeId: string;
  baseTaskId: string;
  employeeName: string;
  employeeRole: string;
  employeeLevel: EmployeeLevel;
  category: RoleplayCategory;
  description: string;
  trainingObjectives: string[];
  objections: string[];
  privateBeliefs: string[];
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface TemplateDefinition {
  key: string;
  employeeId: string;
  taskId: string;
  title: string;
  category: RoleplayCategory;
  description: string;
  trainingObjectives: string[];
  objections: string[];
  privateBeliefs: string[];
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    key: "first-task",
    employeeId: "timur",
    taskId: "prep_veggies",
    title: "Первая самостоятельная заготовка",
    category: "tasking",
    description:
      "Стажёр впервые отвечает за полный объём заготовки. Он хочет проявить себя, но стесняется задавать вопросы и может скрыть ошибку.",
    trainingObjectives: [
      "Объяснить ожидаемый результат и последовательность действий",
      "Зафиксировать срок и контрольную точку",
      "Проверить, как сотрудник понял задачу",
    ],
    objections: [
      "Я вроде понял, можно просто начать?",
      "Не хочу отвлекать вас вопросами",
    ],
    privateBeliefs: ["Если я переспрошу, решат, что я не справляюсь"],
  },
  {
    key: "support-growth",
    employeeId: "marina",
    taskId: "apple_pies",
    title: "Поддержать сотрудника на новой задаче",
    category: "feedback",
    description:
      "Марина освоила базовые операции, но сомневается в себе перед заметным заказом и ждёт одновременно ясных ориентиров и спокойной поддержки.",
    trainingObjectives: [
      "Обозначить ключевые шаги без микроменеджмента",
      "Снизить тревогу и подтвердить доступность помощи",
      "Договориться о промежуточной сверке",
    ],
    objections: [
      "А если снова перепутаю граммовку?",
      "Может, лучше поручить это кому-то опытнее?",
    ],
    privateBeliefs: ["После прошлой ошибки руководитель мне не доверяет"],
  },
  {
    key: "banquet-overload",
    employeeId: "igor",
    taskId: "banquet_hot",
    title: "Расставить приоритеты при перегрузе",
    category: "overload",
    description:
      "Перед банкетом горячий цех перегружен. Игорь способен выполнить задачу, но теряет темп, когда приоритеты меняются без объяснения.",
    trainingObjectives: [
      "Признать реальную нагрузку",
      "Расставить приоритеты и снять конфликтующие задачи",
      "Зафиксировать момент следующей сверки",
    ],
    objections: [
      "Я физически не успею всё одновременно",
      "Вы опять меняете приоритет в середине работы",
    ],
    privateBeliefs: ["Руководитель не понимает фактическую загрузку цеха"],
  },
  {
    key: "new-complex-task",
    employeeId: "anna",
    taskId: "decorated_cake",
    title: "Сильный сотрудник на незнакомой задаче",
    category: "resistance",
    description:
      "Анна опытна в выпечке, но сложный декор для банкета делает впервые. Она ценит самостоятельность и может переоценить перенос своей экспертизы.",
    trainingObjectives: [
      "Обсудить риски новой задачи без обесценивания опыта",
      "Согласовать технологию и контрольные точки",
      "Получить честное подтверждение готовности",
    ],
    objections: [
      "Я давно работаю и сама разберусь",
      "Постоянные проверки только замедлят",
    ],
    privateBeliefs: ["Подробные инструкции означают, что мне не доверяют"],
  },
  {
    key: "delegate-result",
    employeeId: "olga",
    taskId: "salads",
    title: "Делегировать результат опытному сотруднику",
    category: "delegation",
    description:
      "Су-шеф отлично знает холодный цех и ожидает зоны ответственности, а не пошагового контроля. Главный риск — забрать у неё решение обратно.",
    trainingObjectives: [
      "Передать ответственность за результат",
      "Обозначить срок и границы полномочий",
      "Не навязывать способ выполнения",
    ],
    objections: [
      "Если решение всё равно ваше, зачем делегировать?",
      "Мне нужно понимать границы полномочий",
    ],
    privateBeliefs: ["Руководитель вмешается, как только я начну действовать"],
  },
  {
    key: "correct-without-pressure",
    employeeId: "anna",
    taskId: "tiramisu",
    title: "Дать корректирующую обратную связь",
    category: "feedback",
    description:
      "В прошлой партии крем расслоился. Анна уверена в своей технике и воспринимает публичные замечания как сомнение в её профессионализме.",
    trainingObjectives: [
      "Описать факт и последствия без оценки личности",
      "Узнать версию сотрудника",
      "Согласовать конкретное изменение процесса",
    ],
    objections: [
      "Проблема была в продуктах, а не в моей работе",
      "Почему мы обсуждаем только мою ошибку?",
    ],
    privateBeliefs: ["Меня делают крайней за системную проблему"],
  },
];

function templateId(key: string): string {
  return `template:${key}`;
}

function asCategory(value: string): RoleplayCategory {
  return ROLEPLAY_CATEGORIES.includes(value as RoleplayCategory)
    ? (value as RoleplayCategory)
    : "tasking";
}

function asLevel(value: string): EmployeeLevel {
  return ["L1", "L2", "L3", "L4"].includes(value)
    ? (value as EmployeeLevel)
    : "L2";
}

export function buildRoleplayTemplates(catalog: Catalog): RoleplayScenario[] {
  return TEMPLATE_DEFINITIONS.flatMap((definition) => {
    const employee = catalog.employees.find(
      (item) => item.id === definition.employeeId,
    );
    const task = catalog.tasks.find((item) => item.id === definition.taskId);
    if (!employee || !task) return [];
    return [
      {
        id: templateId(definition.key),
        source: "template" as const,
        title: definition.title,
        baseEmployeeId: employee.id,
        baseTaskId: task.id,
        employeeName: employee.name,
        employeeRole: employee.role,
        employeeLevel: employee.level,
        category: definition.category,
        description: definition.description,
        trainingObjectives: definition.trainingObjectives,
        objections: definition.objections,
        privateBeliefs: definition.privateBeliefs,
        isFavorite: false,
        isArchived: false,
        createdAt: null,
        updatedAt: null,
      },
    ];
  });
}

export function mapStoredRoleplayScenario(
  row: typeof GameRoleplayScenario.$inferSelect,
): RoleplayScenario {
  return {
    id: row.id,
    source: "custom",
    title: row.title,
    baseEmployeeId: row.baseEmployeeId,
    baseTaskId: row.baseTaskId,
    employeeName: row.employeeName,
    employeeRole: row.employeeRole,
    employeeLevel: asLevel(row.employeeLevel),
    category: asCategory(row.category),
    description: row.description,
    trainingObjectives: row.trainingObjectives,
    objections: row.objections,
    privateBeliefs: row.privateBeliefs,
    isFavorite: row.isFavorite,
    isArchived: row.isArchived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function resolveRoleplayScenario(
  db: Database,
  catalog: Catalog,
  scenarioId: string,
  userId?: string,
): Promise<RoleplayScenario> {
  const template = buildRoleplayTemplates(catalog).find(
    (item) => item.id === scenarioId,
  );
  if (template) return template;

  if (!z.uuid().safeParse(scenarioId).success) {
    throw new ORPCError("NOT_FOUND", { message: "Сценарий не найден" });
  }

  const [row] = await db
    .select()
    .from(GameRoleplayScenario)
    .where(eq(GameRoleplayScenario.id, scenarioId))
    .limit(1);
  if (!row || (userId && row.createdBy !== userId)) {
    throw new ORPCError("NOT_FOUND", { message: "Сценарий не найден" });
  }
  return mapStoredRoleplayScenario(row);
}

export function snapshotRoleplayScenario(
  scenario: RoleplayScenario,
): GameRoleplayScenarioSnapshot {
  return {
    id: scenario.id,
    source: scenario.source,
    title: scenario.title,
    baseEmployeeId: scenario.baseEmployeeId,
    baseTaskId: scenario.baseTaskId,
    employeeName: scenario.employeeName,
    employeeRole: scenario.employeeRole,
    employeeLevel: scenario.employeeLevel,
    category: scenario.category,
    description: scenario.description,
    trainingObjectives: [...scenario.trainingObjectives],
    objections: [...scenario.objections],
    privateBeliefs: [...scenario.privateBeliefs],
    isFavorite: scenario.isFavorite,
  };
}

export function roleplayScenarioFromSnapshot(
  snapshot: GameRoleplayScenarioSnapshot,
): RoleplayScenario {
  return {
    ...snapshot,
    isArchived: false,
    createdAt: null,
    updatedAt: null,
  };
}

const COMPETENCE_BY_LEVEL: Record<EmployeeLevel, CompetenceState> = {
  L1: "novice",
  L2: "learning",
  L3: "capable",
  L4: "expert",
};

export function applyRoleplayScenario(
  scenario: Pick<
    RoleplayScenario,
    | "title"
    | "employeeName"
    | "employeeRole"
    | "employeeLevel"
    | "description"
    | "objections"
  >,
  employee: Employee,
  task: Task,
): { employee: Employee; task: Task } {
  const competence = COMPETENCE_BY_LEVEL[scenario.employeeLevel];
  return {
    employee: {
      ...employee,
      name: scenario.employeeName,
      role: scenario.employeeRole,
      level: scenario.employeeLevel,
      competences: { ...employee.competences, [task.type]: competence },
      personality: {
        ...employee.personality,
        biography: scenario.description,
        boundaries: scenario.objections,
      },
    },
    task: {
      ...task,
      title: scenario.title,
      failureModes: Array.from(
        new Set([...task.failureModes, ...scenario.objections]),
      ),
    },
  };
}

export function buildRoleplayNotes(
  scenario: RoleplayScenario,
  mode: RoleplayMode,
): string {
  return [
    `Контекст тренировки: ${scenario.description}`,
    `Цели руководителя: ${scenario.trainingObjectives.join("; ") || "провести результативный разговор"}`,
    scenario.objections.length > 0
      ? `Вероятные возражения сотрудника: ${scenario.objections.join("; ")}`
      : "",
    scenario.privateBeliefs.length > 0
      ? `Скрытые установки сотрудника: ${scenario.privateBeliefs.join("; ")}`
      : "",
    mode === "objections"
      ? "Режим: отработка возражений — быстрее переходи к сопротивлению и проверяй реакцию руководителя."
      : "Режим: полный разговор от постановки контекста до договорённости.",
  ]
    .filter(Boolean)
    .join("\n");
}
