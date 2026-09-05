import { describe, expect, test } from "bun:test";

import { defaultCatalog, findEmployee, findTask } from "./catalog";
import { classifyDialogStyle, detectCriteria } from "./heuristics";
import {
  isEngagingUtterance,
  resolveExpectation,
  resolveShiftLoad,
} from "./rules";
import { scoreDialog } from "./scoring";
import { styleCredit } from "./styles";
import type { DialogContext, DialogTurn, GameRound } from "./types";

function context(args: {
  employeeId: string;
  taskId: string;
  round?: GameRound;
  activeOrders?: number;
  soloOnShift?: boolean;
  manager: string[];
}): DialogContext {
  const employee = findEmployee(defaultCatalog, args.employeeId);
  const task = findTask(defaultCatalog, args.taskId);
  if (!employee || !task) throw new Error("fixture not found");

  const activeOrders = args.activeOrders ?? 1;
  const soloOnShift = args.soloOnShift ?? false;
  const turns: DialogTurn[] = args.manager.map((text) => ({
    role: "manager",
    text,
  }));

  return {
    employee,
    task,
    order: {
      id: "order-1",
      taskId: task.id,
      employeeId: employee.id,
      portions: 1,
      deadlineMinutes: 60,
    },
    shift: {
      round: args.round ?? 2,
      activeOrders,
      soloOnShift,
      load: resolveShiftLoad(activeOrders, soloOnShift),
    },
    turns,
    engaged: true,
    emotion: 0,
  };
}

function score(dialog: DialogContext) {
  const expectation = resolveExpectation(
    dialog.employee,
    dialog.task,
    dialog.shift,
  );
  return scoreDialog({
    dialog,
    expectation,
    styleDistribution: classifyDialogStyle(dialog.turns),
    metCriteria: detectCriteria(dialog.turns),
  });
}

describe("resolveExpectation", () => {
  test("expert on a routine task should be delegated to", () => {
    const dialog = context({
      employeeId: "anna",
      taskId: "apple_pies",
      manager: [],
    });
    const expectation = resolveExpectation(
      dialog.employee,
      dialog.task,
      dialog.shift,
    );

    expect(expectation.expectedStyle).toBe("delegating");
    expect(expectation.isNovelTask).toBe(false);
  });

  test("the same expert on a new complex task needs a directive style", () => {
    const dialog = context({
      employeeId: "anna",
      taskId: "decorated_cake",
      manager: [],
    });
    const expectation = resolveExpectation(
      dialog.employee,
      dialog.task,
      dialog.shift,
    );

    expect(expectation.expectedStyle).toBe("directive");
    expect(expectation.isNovelTask).toBe(true);
    expect(expectation.requiredCriteria.map((item) => item.id)).toContain(
      "set_checkpoints",
    );
  });

  test("a trainee always needs structure", () => {
    const dialog = context({
      employeeId: "timur",
      taskId: "prep_veggies",
      manager: [],
    });
    const expectation = resolveExpectation(
      dialog.employee,
      dialog.task,
      dialog.shift,
    );

    expect(expectation.expectedStyle).toBe("directive");
  });

  test("round 3 solo shift adds prioritisation to the required actions", () => {
    const dialog = context({
      employeeId: "anna",
      taskId: "apple_pies",
      round: 3,
      activeOrders: 4,
      soloOnShift: true,
      manager: [],
    });
    const expectation = resolveExpectation(
      dialog.employee,
      dialog.task,
      dialog.shift,
    );

    expect(dialog.shift.load).toBe("overload");
    expect(expectation.requiredCriteria.map((item) => item.id)).toContain(
      "prioritize",
    );
    // Pure delegation under overload is pulled back to supporting.
    expect(expectation.expectedStyle).toBe("supporting");
  });
});

describe("resolveShiftLoad", () => {
  test("the same queue is heavier when the cook is alone", () => {
    expect(resolveShiftLoad(3, false)).toBe("normal");
    expect(resolveShiftLoad(3, true)).toBe("high");
    expect(resolveShiftLoad(4, true)).toBe("overload");
  });
});

describe("styleCredit", () => {
  test("under-managing is punished harder than over-managing", () => {
    expect(styleCredit("directive", "delegating")).toBeLessThan(
      styleCredit("delegating", "directive"),
    );
    expect(styleCredit("coaching", "coaching")).toBe(1);
  });
});

describe("scoreDialog — the worked examples from the spec", () => {
  test("delegating a routine task to an expert scores high", () => {
    const result = score(
      context({
        employeeId: "anna",
        taskId: "apple_pies",
        manager: [
          "Анна, нужно 20 порций пирогов с яблоком к 18:00.",
          "Делай как обычно, на твоё усмотрение — не буду вмешиваться.",
        ],
      }),
    );

    expect(result.expectedStyle).toBe("delegating");
    expect(result.actualStyle).toBe("delegating");
    expect(result.scorePercent).toBeGreaterThanOrEqual(85);
    expect(result.outcome.status).toBe("success");
  });

  test("delegating a brand-new complex task ruins the order", () => {
    const result = score(
      context({
        employeeId: "anna",
        taskId: "decorated_cake",
        manager: [
          "Анна, нужно сделать торт с украшением к 19:00.",
          "На твоё усмотрение, как обычно — не буду вмешиваться.",
        ],
      }),
    );

    expect(result.expectedStyle).toBe("directive");
    expect(result.actualStyle).toBe("delegating");
    expect(result.scorePercent).toBeLessThanOrEqual(30);
    expect(result.outcome.status).toBe("failed");
    expect(result.outcome.defects.length).toBeGreaterThan(0);
  });

  test("the same task managed directively scores high", () => {
    const result = score(
      context({
        employeeId: "anna",
        taskId: "decorated_cake",
        manager: [
          "Анна, нужно сделать торт с украшением к 19:00.",
          "Объясню по шагам: сначала бисквит, потом крем, потом декор по эскизу.",
          "Перед сборкой покажи мне — я проверю. Всё понятно? Повтори, пожалуйста.",
        ],
      }),
    );

    expect(result.actualStyle).toBe("directive");
    expect(result.scorePercent).toBeGreaterThanOrEqual(80);
    expect(result.criteria.every((item) => item.met)).toBe(true);
  });

  test("toxicity drags the score down", () => {
    const dialog = context({
      employeeId: "marina",
      taskId: "salads",
      manager: ["Марина, объясню по шагам, что делать. Всё понятно?"],
    });
    const expectation = resolveExpectation(
      dialog.employee,
      dialog.task,
      dialog.shift,
    );
    const clean = scoreDialog({
      dialog,
      expectation,
      styleDistribution: classifyDialogStyle(dialog.turns),
      metCriteria: detectCriteria(dialog.turns),
    });
    const toxic = scoreDialog({
      dialog,
      expectation,
      styleDistribution: classifyDialogStyle(dialog.turns),
      metCriteria: detectCriteria(dialog.turns),
      toxicTurns: 1,
    });

    expect(toxic.scorePercent).toBeLessThan(clean.scorePercent);
  });
});

describe("isEngagingUtterance", () => {
  const anna = findEmployee(defaultCatalog, "anna");
  if (!anna) throw new Error("fixture not found");

  test("thinking out loud does not wake the employee up", () => {
    expect(isEngagingUtterance("Так, что у нас по заказам...", anna)).toBe(
      false,
    );
  });

  test("addressing by name engages", () => {
    expect(isEngagingUtterance("Анне отдадим пироги", anna)).toBe(true);
  });

  test("a direct question engages", () => {
    expect(isEngagingUtterance("Успеваешь к семи?", anna)).toBe(true);
  });
});
