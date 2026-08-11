import { criterion } from "./criteria";
import { rx } from "./regex";
import { COMPETENCE_LABELS, STYLE_LABELS, styleFromIndex } from "./styles";
import type {
  CompetenceState,
  Criterion,
  CriterionId,
  Employee,
  EmployeeLevel,
  Expectation,
  ShiftContext,
  Task,
} from "./types";

/** Where each readiness level sits on the structure → autonomy axis. */
const LEVEL_BASE_INDEX: Record<EmployeeLevel, number> = {
  L1: 0,
  L2: 1,
  L3: 2,
  L4: 3,
};

/** Position of each competence state on the same axis. */
const COMPETENCE_POSITION: Record<CompetenceState, number> = {
  novice: 0,
  learning: 2,
  capable: 3,
  expert: 4,
};

/**
 * The competence a level already implies for the employee's *usual* work.
 *
 * The shift applied below is the gap between actual and implied competence,
 * not an absolute penalty — otherwise an L2 who is (by definition) still
 * learning would be pushed down a second time and end up managed as a
 * complete novice.
 */
const LEVEL_IMPLIED_COMPETENCE: Record<EmployeeLevel, CompetenceState> = {
  L1: "novice",
  L2: "learning",
  L3: "capable",
  L4: "expert",
};

export function competenceFor(employee: Employee, task: Task): CompetenceState {
  return employee.competences[task.type] ?? "novice";
}

/** A task is "novel" when the employee has not mastered its type yet. */
export function isNovelTask(employee: Employee, task: Task): boolean {
  const competence = competenceFor(employee, task);
  return competence === "novice" || competence === "learning";
}

function requiredCriteriaFor(
  style: string,
  task: Task,
  shift: ShiftContext,
  competence: CompetenceState,
): Criterion[] {
  const ids = new Set<CriterionId>(["clarify_task", "set_deadline"]);

  switch (style) {
    case "directive":
      ids.add("explain_how");
      ids.add("set_checkpoints");
      ids.add("check_understanding");
      break;
    case "coaching":
      ids.add("explain_how");
      ids.add("check_understanding");
      ids.add("set_checkpoints");
      ids.add("motivate");
      break;
    case "supporting":
      ids.add("ask_opinion");
      ids.add("motivate");
      ids.add("offer_help");
      break;
    default:
      ids.add("delegate_authority");
      ids.add("avoid_micromanagement");
      break;
  }

  if (task.requiresCheckpoints) ids.add("set_checkpoints");
  if (task.timeCriticality >= 4) ids.add("set_deadline");
  if (competence === "novice") ids.add("check_understanding");

  if (shift.load === "high" || shift.activeOrders >= 3) ids.add("prioritize");
  if (shift.load === "overload") {
    ids.add("prioritize");
    ids.add("offer_help");
    ids.add("reduce_scope");
  }
  if (shift.soloOnShift) ids.add("prioritize");

  return [...ids].map(criterion);
}

function buildRationale(
  employee: Employee,
  task: Task,
  shift: ShiftContext,
  competence: CompetenceState,
  style: string,
): string {
  const parts = [
    `${employee.name} — уровень ${employee.level}`,
    `задача «${task.title}» для него/неё: ${COMPETENCE_LABELS[competence]}`,
  ];
  if (task.complexity >= 4) parts.push("задача сложная");
  if (shift.soloOnShift) parts.push("сотрудник один в смене");
  if (shift.load === "high") parts.push("нагрузка повышенная");
  if (shift.load === "overload") parts.push("сотрудник перегружен");

  const label = STYLE_LABELS[style as keyof typeof STYLE_LABELS] ?? style;
  return `${parts.join("; ")}. Ожидаемый стиль — ${label.toLowerCase()}.`;
}

/**
 * Resolve what a correct manager should do:
 *
 *   (уровень сотрудника) + (компетенция по задаче) + (контекст смены)
 *      → ожидаемый стиль + ожидаемые управленческие действия
 */
export function resolveExpectation(
  employee: Employee,
  task: Task,
  shift: ShiftContext,
): Expectation {
  const competence = competenceFor(employee, task);

  let index = LEVEL_BASE_INDEX[employee.level];

  // The gap between what the level implies and what this employee can actually
  // do with *this* kind of task. Zero for routine work; deeply negative when a
  // senior person is handed something they have never done.
  index +=
    COMPETENCE_POSITION[competence] -
    COMPETENCE_POSITION[LEVEL_IMPLIED_COMPETENCE[employee.level]];

  // Complexity adds structure only where it compounds inexperience. A large
  // banquet is not "new" for a cook who does hot line every day, so scale
  // alone must not push a capable employee back into being taught the recipe.
  const inexperienced = competence === "novice" || competence === "learning";
  if (task.complexity >= 4 && inexperienced) index -= 1;
  if (task.complexity === 5 && competence === "capable") index -= 1;

  // Clamp before applying shift modifiers, otherwise "expert + already
  // delegating" would absorb the round-3 correction below.
  index = Math.min(3, Math.max(0, index));

  // Under overload pure delegation turns into chaos: the manager still has to
  // hold priorities, so we pull the expectation one step back towards support.
  if (shift.load === "overload" && index >= 3) index -= 1;

  // Under high load a novice cannot be micromanaged step by step either — the
  // manager must at least keep them at coaching level rather than dictating
  // every move while the queue grows.
  if (shift.load === "overload" && index <= 0 && competence !== "novice") {
    index += 1;
  }

  const expectedStyle = styleFromIndex(index);

  return {
    expectedStyle,
    competence,
    isNovelTask: isNovelTask(employee, task),
    requiredCriteria: requiredCriteriaFor(
      expectedStyle,
      task,
      shift,
      competence,
    ),
    rationale: buildRationale(employee, task, shift, competence, expectedStyle),
  };
}

/**
 * Derive the kitchen load from the order queue.
 *
 * Round 3 leaves a single cook on shift, so the same queue length means a much
 * heavier load than in round 2.
 */
export function resolveShiftLoad(
  activeOrders: number,
  soloOnShift: boolean,
): ShiftContext["load"] {
  const threshold = soloOnShift ? 2 : 4;
  if (activeOrders > threshold + 1) return "overload";
  if (activeOrders > threshold) return "high";
  return "normal";
}

const NAME_FREE_ENGAGEMENT = [
  /\?\s*$/,
  rx("\\bсможешь\\b"),
  rx("\\bуспева(ешь|ете)\\b"),
  rx("\\bготов[аы]?\\b"),
  rx("\\bнужно\\b"),
  rx("\\bсделай\\b"),
  rx("\\bвозьми\\b"),
  rx("\\bприготовь\\b"),
  rx("\\bзайми(сь|тесь)\\b"),
  rx("\\bдавай\\b"),
];

/**
 * The AI employee stays silent until the manager actually brings them into the
 * dialog — by name, with a question, or with a direct assignment. Thinking out
 * loud next to the pass does not count.
 */
export function isEngagingUtterance(
  text: string,
  employee: Pick<Employee, "name">,
): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  const firstName = employee.name.split(" ")[0] ?? employee.name;
  // Match the name stem so Russian cases ("Анну", "Анне") still count.
  const stem = firstName.slice(0, Math.max(3, firstName.length - 1));
  if (new RegExp(stem, "i").test(trimmed)) return true;

  return NAME_FREE_ENGAGEMENT.some((pattern) => pattern.test(trimmed));
}
