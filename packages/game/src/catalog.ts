import type { Catalog, Employee, Task } from "./types";

/**
 * Reference data for the restaurant scenario ("заранее загружено" in the spec).
 *
 * It ships as code so tests, the eval harness and the DB seed all agree on the
 * same numbers; the DB copy is editable by the administrator afterwards.
 */

export const TASK_TYPES = {
  baking: "Выпечка",
  decorating: "Декорирование тортов",
  hot_line: "Горячий цех",
  cold_starters: "Холодные закуски",
  prep: "Заготовки",
} as const;

export const EMPLOYEES: Employee[] = [
  {
    id: "anna",
    name: "Анна Соколова",
    role: "Повар десертов",
    level: "L4",
    gender: "female",
    competences: {
      baking: "expert",
      decorating: "novice",
      prep: "capable",
      cold_starters: "learning",
    },
    personality: {
      tone: "independent",
      reactionToDirective: "resents",
      reactionToSupport: "neutral",
      typicalErrors: [
        "берётся за незнакомое без уточнений",
        "не предупреждает, что не успевает",
      ],
      motivators: ["самостоятельность", "признание экспертизы"],
      demotivators: ["мелочный контроль", "публичные замечания"],
    },
  },
  {
    id: "igor",
    name: "Игорь Петров",
    role: "Повар горячего цеха",
    level: "L3",
    gender: "male",
    competences: {
      hot_line: "capable",
      prep: "capable",
      baking: "novice",
      decorating: "novice",
      cold_starters: "capable",
    },
    personality: {
      tone: "confident",
      reactionToDirective: "neutral",
      reactionToSupport: "needs",
      typicalErrors: ["теряет темп при нескольких заказах разом"],
      motivators: ["чёткие приоритеты", "похвала за скорость"],
      demotivators: ["неопределённость", "смена задачи на середине"],
    },
  },
  {
    id: "marina",
    name: "Марина Лебедева",
    role: "Помощник повара",
    level: "L2",
    gender: "female",
    competences: {
      prep: "learning",
      cold_starters: "learning",
      baking: "novice",
      decorating: "novice",
      hot_line: "novice",
    },
    personality: {
      tone: "anxious",
      reactionToDirective: "accepts",
      reactionToSupport: "needs",
      typicalErrors: ["боится переспросить", "путает граммовки"],
      motivators: ["понятные шаги", "поддержка"],
      demotivators: ["резкий тон", "работа без объяснений"],
    },
  },
  {
    id: "timur",
    name: "Денис Волков",
    role: "Стажёр",
    level: "L1",
    gender: "male",
    competences: {
      prep: "novice",
      cold_starters: "novice",
      baking: "novice",
      decorating: "novice",
      hot_line: "novice",
    },
    personality: {
      tone: "anxious",
      reactionToDirective: "accepts",
      reactionToSupport: "needs",
      typicalErrors: ["делает по-своему, если не показали", "молчит об ошибке"],
      motivators: ["наставничество", "маленькие победы"],
      demotivators: ["задача без объяснения", "критика при госте"],
    },
  },
  {
    id: "olga",
    name: "Ольга Веретенникова",
    role: "Су-шеф",
    level: "L4",
    gender: "female",
    competences: {
      hot_line: "expert",
      cold_starters: "expert",
      prep: "expert",
      baking: "capable",
      decorating: "capable",
    },
    personality: {
      tone: "independent",
      reactionToDirective: "resents",
      reactionToSupport: "dislikes",
      typicalErrors: ["берёт на себя слишком много"],
      motivators: ["зона ответственности", "доверие"],
      demotivators: ["дублирующий контроль"],
    },
  },
];

export const TASKS: Task[] = [
  {
    id: "apple_pies",
    title: "Пироги с яблоком, 20 порций",
    type: "baking",
    complexity: 2,
    timeCriticality: 3,
    requiresCheckpoints: false,
    failureModes: ["непропечённое тесто", "не та начинка"],
  },
  {
    id: "decorated_cake",
    title: "Торт с украшением на банкет",
    type: "decorating",
    complexity: 5,
    timeCriticality: 4,
    requiresCheckpoints: true,
    failureModes: [
      "крем поплыл",
      "украшение не по эскизу",
      "торт не собран к сроку",
    ],
  },
  {
    id: "tiramisu",
    title: "Тирамису, 12 порций",
    type: "baking",
    complexity: 3,
    timeCriticality: 2,
    requiresCheckpoints: false,
    failureModes: ["крем расслоился", "нарушены пропорции"],
  },
  {
    id: "banquet_hot",
    title: "Горячее на банкет, 40 порций",
    type: "hot_line",
    complexity: 4,
    timeCriticality: 5,
    requiresCheckpoints: true,
    failureModes: ["часть блюд остыла", "разная прожарка", "задержка подачи"],
  },
  {
    id: "steak",
    title: "Стейк рибай, средняя прожарка",
    type: "hot_line",
    complexity: 3,
    timeCriticality: 5,
    requiresCheckpoints: false,
    failureModes: ["пережарен", "подан холодным"],
  },
  {
    id: "salads",
    title: "Салаты дня, 15 порций",
    type: "cold_starters",
    complexity: 2,
    timeCriticality: 3,
    requiresCheckpoints: false,
    failureModes: ["нарушена подача", "перепутана заправка"],
  },
  {
    id: "prep_veggies",
    title: "Заготовка овощей на смену",
    type: "prep",
    complexity: 1,
    timeCriticality: 2,
    requiresCheckpoints: false,
    failureModes: ["неровная нарезка", "не хватило объёма"],
  },
  {
    id: "new_menu_dish",
    title: "Новое блюдо из меню-сета",
    type: "hot_line",
    complexity: 5,
    timeCriticality: 4,
    requiresCheckpoints: true,
    failureModes: [
      "блюдо не соответствует технологической карте",
      "нарушена подача",
    ],
  },
];

export const defaultCatalog: Catalog = { employees: EMPLOYEES, tasks: TASKS };

export function findEmployee(
  catalog: Catalog,
  employeeId: string,
): Employee | undefined {
  return catalog.employees.find((employee) => employee.id === employeeId);
}

export function findTask(catalog: Catalog, taskId: string): Task | undefined {
  return catalog.tasks.find((task) => task.id === taskId);
}
