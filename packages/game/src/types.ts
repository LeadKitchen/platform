/**
 * Domain model for the "Ситуационное руководство" business game.
 *
 * Everything here is pure data + pure functions: no I/O, no LLM, no database.
 * The AI engine (`@acme/ai`) and the offline harness (`@acme/eval`) both build
 * on top of this module, which keeps the methodology (levels, styles, the
 * "уровень × новизна задачи" matrix and the scoring rubric) in exactly one
 * place regardless of which AI approach is plugged in.
 */

/** Management styles, ordered from most to least structure. */
export const MANAGEMENT_STYLES = [
  "directive",
  "coaching",
  "supporting",
  "delegating",
] as const;

export type ManagementStyle = (typeof MANAGEMENT_STYLES)[number];

/** Employee readiness levels (L1 — lowest, L4 — highest). */
export const EMPLOYEE_LEVELS = ["L1", "L2", "L3", "L4"] as const;

export type EmployeeLevel = (typeof EMPLOYEE_LEVELS)[number];

/**
 * How competent an employee is at a concrete *type* of task.
 *
 * This is deliberately separate from {@link EmployeeLevel}: the whole point of
 * the methodology is that a senior employee facing a brand-new task needs a
 * more directive style than the same employee on routine work.
 */
export const COMPETENCE_STATES = [
  "novice",
  "learning",
  "capable",
  "expert",
] as const;

export type CompetenceState = (typeof COMPETENCE_STATES)[number];

/** Rounds of the game. Round 1 has no AI, so the module only models 2 and 3. */
export type GameRound = 2 | 3;

/** Kitchen load, derived from the order queue. Drives round-3 modifiers. */
export const SHIFT_LOADS = ["normal", "high", "overload"] as const;

export type ShiftLoad = (typeof SHIFT_LOADS)[number];

export interface EmployeePersonality {
  /** Baseline tone of voice. */
  tone: "confident" | "anxious" | "independent";
  /** How the character reacts to a directive style. */
  reactionToDirective: "accepts" | "neutral" | "resents";
  /** How the character reacts to a supportive style. */
  reactionToSupport: "needs" | "neutral" | "dislikes";
  typicalErrors: string[];
  motivators: string[];
  demotivators: string[];
}

export interface Employee {
  id: string;
  name: string;
  /** Job title shown to participants, e.g. "повар десертов". */
  role: string;
  level: EmployeeLevel;
  /** Competence per task type (`Task.type`). Missing entry ⇒ `novice`. */
  competences: Record<string, CompetenceState>;
  personality: EmployeePersonality;
}

export interface Task {
  id: string;
  title: string;
  /** Task family used to look up `Employee.competences`. */
  type: string;
  /** 1 (trivial) — 5 (very complex). */
  complexity: 1 | 2 | 3 | 4 | 5;
  /** 1 (no rush) — 5 (must be served immediately). */
  timeCriticality: 1 | 2 | 3 | 4 | 5;
  /** Whether the methodology mandates explicit control points. */
  requiresCheckpoints: boolean;
  /** What goes wrong when the task is mismanaged — used in the outcome report. */
  failureModes: string[];
}

/** A concrete order placed in a session: a task assigned to an employee. */
export interface Order {
  id: string;
  taskId: string;
  employeeId: string;
  portions: number;
  /** Minutes remaining until the guest expects the order. */
  deadlineMinutes: number;
  /** Free-form guest wishes ("без сахара", "к 19:00 на банкет"). */
  notes?: string;
}

/** State of the kitchen at the moment of the dialog. */
export interface ShiftContext {
  round: GameRound;
  /** Number of orders currently in the queue for this employee. */
  activeOrders: number;
  /** True in round 3: a single cook is left on shift. */
  soloOnShift: boolean;
  load: ShiftLoad;
}

/** Criteria the manager is scored against. */
export const CRITERION_IDS = [
  "clarify_task",
  "set_deadline",
  "explain_how",
  "set_checkpoints",
  "check_understanding",
  "motivate",
  "ask_opinion",
  "offer_help",
  "delegate_authority",
  "avoid_micromanagement",
  "prioritize",
  "reduce_scope",
] as const;

export type CriterionId = (typeof CRITERION_IDS)[number];

export interface Criterion {
  id: CriterionId;
  /** Russian label shown to the administrator. */
  title: string;
  /** Relative weight inside the "managerial actions" component. */
  weight: number;
}

/** What a correct manager is expected to do in this exact situation. */
export interface Expectation {
  expectedStyle: ManagementStyle;
  /** Competence of this employee for this order's task type. */
  competence: CompetenceState;
  /** True when the task is new/complex for the employee. */
  isNovelTask: boolean;
  /** Criteria that must be covered, in priority order. */
  requiredCriteria: Criterion[];
  /** Short RU explanation of *why* this style is expected. */
  rationale: string;
}

/** Probability mass over styles detected in the manager's speech. */
export type StyleDistribution = Record<ManagementStyle, number>;

export interface CriterionResult {
  id: CriterionId;
  title: string;
  weight: number;
  met: boolean;
  /** Short RU comment shown in the admin breakdown. */
  comment?: string;
}

export const OUTCOME_STATUSES = ["success", "partial", "failed"] as const;

export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

/** Simulated business result of the order — the "непропечённый пирог" part. */
export interface OrderOutcome {
  status: OutcomeStatus;
  onTime: boolean;
  /** Concrete defects taken from `Task.failureModes` / typical errors. */
  defects: string[];
  /** −2 … +2 change of the employee's motivation. */
  motivationDelta: number;
  /** RU one-liner for the administrator. */
  summary: string;
}

export interface ScoreBreakdown {
  /** 0–45: how well the actual style matched the expected one. */
  style: number;
  /** 0–35: coverage of the required managerial actions. */
  actions: number;
  /** 0–20: business result of the order. */
  outcome: number;
  /** ≤ 0: penalties (toxicity, breaking the role-play frame). */
  penalties: number;
}

export interface Evaluation {
  /** Final 0–100 score reported to the administrator. */
  scorePercent: number;
  expectedStyle: ManagementStyle;
  /** Dominant style detected in the manager's speech. */
  actualStyle: ManagementStyle;
  styleDistribution: StyleDistribution;
  criteria: CriterionResult[];
  outcome: OrderOutcome;
  breakdown: ScoreBreakdown;
  /** RU explanation: what was done right / wrong and why. */
  summary: string;
}

/** One turn of the dialog. */
export interface DialogTurn {
  role: "manager" | "employee";
  text: string;
  at?: string;
}

/** Everything the AI engine needs to know to play one dialog. */
export interface DialogContext {
  employee: Employee;
  task: Task;
  order: Order;
  shift: ShiftContext;
  turns: DialogTurn[];
  /**
   * Whether the manager has already pulled the employee into the dialog.
   * Until then the character stays silent — required by the spec.
   */
  engaged: boolean;
  /** −2 … +2, accumulated over the dialog. */
  emotion: number;
}

/** Reference data loaded before a game starts. */
export interface Catalog {
  employees: Employee[];
  tasks: Task[];
}
