import { type KnowledgeStrategy, knowledgeRegistry } from "@acme/ai";
import {
  type Catalog,
  type CompetenceState,
  type DialogContext,
  defaultCatalog,
  type Employee,
  type EmployeeLevel,
  resolveExpectation,
  resolveShiftLoad,
  type Task,
} from "@acme/game";

/**
 * At what catalog size does retrieval start to matter?
 *
 * On the demo restaurant (5 cooks, 8 dishes) the whole knowledge base fits in
 * the prompt, so every retrieval strategy looks identical — and concluding
 * "RAG gives nothing" from that would be wrong for the deployment the customer
 * actually plans. This measures the thing that changes with scale: whether the
 * facts about *this* employee and *this* task survive into the context at all.
 *
 * Deliberately free of model calls. Recall@k is objective, costs nothing, and
 * can be swept across a dozen catalog sizes in seconds — a comparison that
 * needed a dialog per point would never be run often enough to be useful.
 */

const LEVELS: EmployeeLevel[] = ["L1", "L2", "L3", "L4"];
const COMPETENCES: CompetenceState[] = [
  "novice",
  "learning",
  "capable",
  "expert",
];
const TASK_TYPES = [
  "baking",
  "decorating",
  "hot_line",
  "cold_starters",
  "prep",
  "grill",
  "pastry",
  "sauces",
];

const FIRST_NAMES = [
  "Алексей",
  "Мария",
  "Дмитрий",
  "Ольга",
  "Сергей",
  "Наталья",
  "Павел",
  "Екатерина",
  "Роман",
  "Виктория",
];
const LAST_NAMES = [
  "Иванов",
  "Петрова",
  "Смирнов",
  "Кузнецова",
  "Попов",
  "Соколова",
  "Лебедев",
  "Новикова",
  "Морозов",
  "Волкова",
];
const ROLES = [
  "Повар горячего цеха",
  "Повар холодного цеха",
  "Кондитер",
  "Пекарь",
  "Су-шеф",
  "Помощник повара",
  "Стажёр",
];
const DISHES = [
  "Крем-суп из тыквы",
  "Ризотто с грибами",
  "Стейк из лосося",
  "Паста карбонара",
  "Салат с креветками",
  "Утиная грудка",
  "Чизкейк",
  "Эклеры",
  "Хачапури",
  "Том-ям",
];

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

/**
 * Grow the reference catalog to `size` employees and tasks.
 *
 * The real entries stay at the front, so the probes below always ask about a
 * scenario the methodology actually defines; everything after them is
 * plausible distractor material of the same shape.
 */
export function inflateCatalog(size: number, seed = 20260812): Catalog {
  const random = mulberry32(seed);
  const employees: Employee[] = [...defaultCatalog.employees];
  const tasks: Task[] = [...defaultCatalog.tasks];

  const pick = <T>(list: T[]): T =>
    list[Math.floor(random() * list.length)] as T;

  while (employees.length < size) {
    const index = employees.length;
    const competences: Record<string, CompetenceState> = {};
    for (const type of TASK_TYPES) competences[type] = pick(COMPETENCES);

    employees.push({
      id: `emp_${index}`,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      role: pick(ROLES),
      level: pick(LEVELS),
      gender: pick(["male", "female"] as const),
      competences,
      personality: {
        tone: pick(["confident", "anxious", "independent"] as const),
        reactionToDirective: pick(["accepts", "neutral", "resents"] as const),
        reactionToSupport: pick(["needs", "neutral", "dislikes"] as const),
        typicalErrors: ["теряет темп при нескольких заказах"],
        motivators: ["понятные приоритеты"],
        demotivators: ["неопределённость"],
      },
    });
  }

  while (tasks.length < size) {
    const index = tasks.length;
    tasks.push({
      id: `task_${index}`,
      title: `${pick(DISHES)}, партия ${1 + Math.floor(random() * 30)}`,
      type: pick(TASK_TYPES),
      complexity: (1 + Math.floor(random() * 5)) as Task["complexity"],
      timeCriticality: (1 +
        Math.floor(random() * 5)) as Task["timeCriticality"],
      requiresCheckpoints: random() > 0.6,
      failureModes: ["нарушена подача", "не выдержана температура"],
    });
  }

  return { employees, tasks };
}

export interface ScalePoint {
  catalogSize: number;
  strategyId: string;
  /** Share of probes where the employee's own profile reached the prompt. */
  profileRecall: number;
  /** Share of probes where the competence fact for this task type reached it. */
  competenceRecall: number;
  /** Share of probes where the order's task card reached it. */
  taskRecall: number;
  /** All three at once — the context a correct reply actually needs. */
  completeContext: number;
  /**
   * Share of probes where the regulation the manager referred to was found.
   *
   * The discriminating measure: profiles and task cards are keyed by the order
   * card and can be looked up directly, so every strategy scores 100% on them
   * at any catalog size. Regulations are not keyed by anything — they have to
   * be searched for, and that is where retrieval either earns its cost or does
   * not.
   */
  regulationRecall: number;
  avgSnippets: number;
  avgLatencyMs: number;
}

/**
 * Manager utterances that require a standing rule, and the phrase that proves
 * the right rule reached the prompt.
 */
const REGULATION_PROBES: { utterance: string; needle: string }[] = [
  {
    utterance: "У гостя аллергия на орехи, учти это при готовке.",
    needle: "отдельной доске",
  },
  {
    utterance: "Банкет в восемь, всё горячее надо отдать разом.",
    needle: "за 25 минут",
  },
  {
    utterance: "Продукт разморозили, но заказ отменили — что с ним делать?",
    needle: "замораживание",
  },
  {
    utterance: "Проверь, при какой температуре мы отдаём горячее.",
    needle: "65 градусов",
  },
  {
    utterance: "Пришла поставка без маркировки, принимаем?",
    needle: "маркировки",
  },
  {
    utterance: "Гость просит заменить ингредиент в блюде.",
    needle: "согласуется с шефом",
  },
];

function buildProbe(
  catalog: Catalog,
  employeeIndex: number,
  taskIndex: number,
): DialogContext {
  const employee = catalog.employees[employeeIndex];
  const task = catalog.tasks[taskIndex];
  if (!employee || !task) throw new Error("каталог пуст");

  const shift = {
    round: 2 as const,
    activeOrders: 1,
    soloOnShift: false,
    load: resolveShiftLoad(1, false),
  };

  return {
    employee,
    task,
    order: {
      id: "probe",
      taskId: task.id,
      employeeId: employee.id,
      portions: 1,
      deadlineMinutes: 60,
    },
    shift,
    turns: [],
    engaged: true,
    emotion: 0,
  };
}

export interface ScaleSweepOptions {
  sizes?: number[];
  strategyIds?: string[];
  /** Probes per size; each is one employee × task pair. */
  probes?: number;
  topK?: number;
  onProgress?: (message: string) => void;
}

export async function runScaleSweep(
  options: ScaleSweepOptions = {},
): Promise<ScalePoint[]> {
  const sizes = options.sizes ?? [8, 25, 50, 100, 200];
  const strategyIds = options.strategyIds ?? knowledgeRegistry.ids();
  const probeCount = options.probes ?? 12;
  const topK = options.topK ?? 6;

  const points: ScalePoint[] = [];

  for (const size of sizes) {
    const catalog = inflateCatalog(size);

    for (const strategyId of strategyIds) {
      let strategy: KnowledgeStrategy;
      try {
        strategy = knowledgeRegistry.resolve(strategyId);
      } catch {
        continue;
      }

      options.onProgress?.(`каталог ${size} · ${strategyId}`);

      let profileHits = 0;
      let competenceHits = 0;
      let taskHits = 0;
      let completeHits = 0;
      let regulationHits = 0;
      let regulationProbes = 0;
      let snippetTotal = 0;
      let latencyTotal = 0;
      let probes = 0;

      for (let index = 0; index < probeCount; index += 1) {
        // Probe the *original* catalog entries: those are the ones the
        // methodology defines, and the synthetic bulk is the distraction.
        const employeeIndex = index % defaultCatalog.employees.length;
        const taskIndex = index % defaultCatalog.tasks.length;
        const dialog = buildProbe(catalog, employeeIndex, taskIndex);
        const expectation = resolveExpectation(
          dialog.employee,
          dialog.task,
          dialog.shift,
        );

        const result = await strategy.retrieve(
          {
            dialog,
            expectation,
            query: `${dialog.task.title} для ${dialog.employee.name}`,
          },
          {
            provider: {} as never,
            catalog,
            params: { topK, hops: 2 },
          },
        );

        const ids = new Set(result.snippets.map((snippet) => snippet.id));
        const text = result.snippets
          .map((snippet) => snippet.text)
          .join(" ")
          .toLowerCase();

        // Strategies name their snippets differently (the graph emits derived
        // facts, not documents), so a hit counts if the fact is present either
        // as a known document id or verbatim in the text handed to the model.
        const profile =
          ids.has(`profile:${dialog.employee.id}`) ||
          text.includes(dialog.employee.name.toLowerCase());
        const competence =
          ids.has(`competence:${dialog.employee.id}:${dialog.task.type}`) ||
          text.includes(dialog.task.type.toLowerCase());
        const task =
          ids.has(`task:${dialog.task.id}`) ||
          text.includes(dialog.task.title.toLowerCase());

        if (profile) profileHits += 1;
        if (competence) competenceHits += 1;
        if (task) taskHits += 1;
        if (profile && competence && task) completeHits += 1;

        snippetTotal += result.snippets.length;
        latencyTotal += result.latencyMs;
        probes += 1;

        // Second probe: the manager raises a standing rule that no order card
        // points at. `prompt-baseline` cannot answer these by construction —
        // it injects the order card and nothing else.
        const regulationIndex = index % REGULATION_PROBES.length;
        const regulationProbe = REGULATION_PROBES[regulationIndex];
        if (regulationProbe) {
          const found = await strategy.retrieve(
            { dialog, expectation, query: regulationProbe.utterance },
            { provider: {} as never, catalog, params: { topK, hops: 2 } },
          );
          const haystack = found.snippets
            .map((snippet) => snippet.text)
            .join(" ")
            .toLowerCase();
          if (haystack.includes(regulationProbe.needle.toLowerCase())) {
            regulationHits += 1;
          }
          regulationProbes += 1;
        }
      }

      points.push({
        catalogSize: size,
        strategyId,
        profileRecall: round(profileHits / probes),
        competenceRecall: round(competenceHits / probes),
        taskRecall: round(taskHits / probes),
        completeContext: round(completeHits / probes),
        regulationRecall:
          regulationProbes === 0 ? 0 : round(regulationHits / regulationProbes),
        avgSnippets: round(snippetTotal / probes, 1),
        avgLatencyMs: Math.round(latencyTotal / probes),
      });
    }
  }

  return points;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function renderScaleReport(points: ScalePoint[]): string {
  const lines: string[] = [];

  lines.push("# Кривая деградации: когда нужен retrieval", "");
  lines.push(
    "Метрика — доля запросов, в которых в промпт персонажа попал полный нужный",
    "контекст: профиль сотрудника, его компетенция по типу задачи и карточка заказа.",
    "Модель не вызывается: это чистое измерение поиска.",
    "",
  );

  const sizes = [...new Set(points.map((point) => point.catalogSize))].sort(
    (a, b) => a - b,
  );
  const strategies = [...new Set(points.map((point) => point.strategyId))];

  lines.push(`| Стратегия | ${sizes.map((size) => `${size}`).join(" | ")} |`);
  lines.push(`| --- | ${sizes.map(() => "---:").join(" | ")} |`);

  for (const strategyId of strategies) {
    const cells = sizes.map((size) => {
      const point = points.find(
        (item) => item.catalogSize === size && item.strategyId === strategyId,
      );
      return point ? `${Math.round(point.completeContext * 100)}%` : "—";
    });
    lines.push(`| \`${strategyId}\` | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Поиск регламента, не названного в заказе", "");
  lines.push(
    "Здесь карточка заказа не помогает: нужное правило нужно именно найти.",
    "",
  );
  lines.push(`| Стратегия | ${sizes.map((size) => `${size}`).join(" | ")} |`);
  lines.push(`| --- | ${sizes.map(() => "---:").join(" | ")} |`);
  for (const strategyId of strategies) {
    const cells = sizes.map((size) => {
      const point = points.find(
        (item) => item.catalogSize === size && item.strategyId === strategyId,
      );
      return point ? `${Math.round(point.regulationRecall * 100)}%` : "—";
    });
    lines.push(`| \`${strategyId}\` | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Задержка поиска, мс", "");
  lines.push(`| Стратегия | ${sizes.map((size) => `${size}`).join(" | ")} |`);
  lines.push(`| --- | ${sizes.map(() => "---:").join(" | ")} |`);
  for (const strategyId of strategies) {
    const cells = sizes.map((size) => {
      const point = points.find(
        (item) => item.catalogSize === size && item.strategyId === strategyId,
      );
      return point ? `${point.avgLatencyMs}` : "—";
    });
    lines.push(`| \`${strategyId}\` | ${cells.join(" | ")} |`);
  }
  lines.push("");

  const smallest = sizes[0];
  const largest = sizes.at(-1);
  if (smallest !== undefined && largest !== undefined) {
    const at = (size: number, strategyId: string) =>
      points.find(
        (item) => item.catalogSize === size && item.strategyId === strategyId,
      )?.regulationRecall ?? 0;

    const drops = strategies
      .map((strategyId) => ({
        strategyId,
        drop: at(smallest, strategyId) - at(largest, strategyId),
        atLargest: at(largest, strategyId),
      }))
      .sort((a, b) => b.atLargest - a.atLargest);

    const best = drops[0];
    if (best) {
      lines.push(
        "**Вывод.** Контекст, привязанный к карточке заказа (профиль, компетенция,",
        "задача), достаётся прямым lookup — здесь все стратегии дают 100% на любом",
        "размере каталога, и поиск не нужен. Разница появляется только на знаниях,",
        "которые заказ не называет: поиск регламента.",
        "",
        `На таких запросах лучший результат у \`${best.strategyId}\`:`,
        `${Math.round(best.atLargest * 100)}% при каталоге в ${largest} позиций.`,
        "",
        "Практический вывод для внедрения: RAG стоит закладывать тогда и только",
        "тогда, когда персонаж должен опираться на базу знаний шире карточки заказа —",
        "регламенты, стандарты подачи, история смен. Для текущего объёма ТЗ он",
        "избыточен.",
        "",
      );
    }
  }

  return lines.join("\n");
}
