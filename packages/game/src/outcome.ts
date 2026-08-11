import type {
  Employee,
  Expectation,
  OrderOutcome,
  ShiftContext,
  Task,
} from "./types";

export interface OutcomeInput {
  employee: Employee;
  task: Task;
  shift: ShiftContext;
  expectation: Expectation;
  /** 0–1, how close the chosen style was to the expected one. */
  styleCredit: number;
  /** 0–1, share of the required managerial actions that were covered. */
  actionsCoverage: number;
  /** True when the manager over-managed (more structure than needed). */
  overManaged: boolean;
}

/**
 * Turn the quality of management into a business result.
 *
 * The spec is explicit that the score must be tied to what actually happened
 * to the order ("непропечённый пирог, не та начинка"), not only to the style
 * label — so the outcome is simulated deterministically from the same inputs
 * the score uses, and both are reported to the administrator.
 */
export function simulateOutcome(input: OutcomeInput): OrderOutcome {
  const {
    employee,
    task,
    shift,
    expectation,
    styleCredit,
    actionsCoverage,
    overManaged,
  } = input;

  const risk =
    (expectation.isNovelTask ? 0.25 : 0) +
    (task.complexity >= 4 ? 0.15 : 0) +
    (shift.load === "overload" ? 0.2 : shift.load === "high" ? 0.1 : 0);

  const quality =
    0.6 * styleCredit + 0.4 * actionsCoverage - risk * (1 - styleCredit);

  const defects: string[] = [];
  let status: OrderOutcome["status"];

  if (quality >= 0.7) {
    status = "success";
  } else if (quality >= 0.4) {
    status = "partial";
    defects.push(task.failureModes[0] ?? "мелкие отклонения от стандарта");
  } else {
    status = "failed";
    defects.push(
      ...task.failureModes.slice(0, 2),
      ...employee.personality.typicalErrors.slice(0, 1),
    );
  }

  const timePressure =
    task.timeCriticality >= 4 || shift.load !== "normal" || shift.soloOnShift;
  const prioritized = expectation.requiredCriteria.every(
    (criterion) => criterion.id !== "prioritize",
  )
    ? true
    : actionsCoverage >= 0.6;
  const onTime = status !== "failed" && (!timePressure || prioritized);

  let motivationDelta = 0;
  if (status === "success") motivationDelta += 1;
  if (status === "failed") motivationDelta -= 1;
  if (overManaged && employee.personality.reactionToDirective === "resents") {
    motivationDelta -= 1;
  }
  if (!overManaged && styleCredit >= 0.9) motivationDelta += 1;
  if (styleCredit <= 0.2) motivationDelta -= 1;
  motivationDelta = Math.max(-2, Math.min(2, motivationDelta));

  const summary = buildSummary(status, onTime, defects, motivationDelta);

  return { status, onTime, defects, motivationDelta, summary };
}

function buildSummary(
  status: OrderOutcome["status"],
  onTime: boolean,
  defects: string[],
  motivationDelta: number,
): string {
  const head =
    status === "success"
      ? "Заказ выполнен по стандарту"
      : status === "partial"
        ? "Заказ выполнен с замечаниями"
        : "Заказ испорчен";

  const parts = [head, onTime ? "в срок" : "с опозданием"];
  if (defects.length > 0) parts.push(`проблемы: ${defects.join(", ")}`);
  if (motivationDelta < 0) parts.push("сотрудник демотивирован");
  if (motivationDelta > 0) parts.push("сотрудник замотивирован");

  return `${parts.join("; ")}.`;
}
