import { describe, expect, test } from "bun:test";
import type { GameCoachingPathSnapshot } from "@acme/db";
import { advanceCoachingPath } from "./coaching-paths";

const snapshot = {
  name: "Новый руководитель",
  description: "",
  steps: [
    { id: "step-1", minScore: 60, scenario: {} },
    { id: "step-2", minScore: 75, scenario: {} },
  ],
} as unknown as GameCoachingPathSnapshot;

describe("advanceCoachingPath", () => {
  test("keeps the current step when the score is below the threshold", () => {
    const result = advanceCoachingPath({
      snapshot,
      currentStep: 0,
      stepResults: [],
      stepId: "step-1",
      sessionId: "session-1",
      dialogId: "dialog-1",
      scorePercent: 59,
    });
    expect(result?.currentStep).toBe(0);
    expect(result?.status).toBe("in_progress");
    expect(result?.eventName).toBe("coaching_path_step_retry");
  });

  test("unlocks the next step at the exact pass score", () => {
    const result = advanceCoachingPath({
      snapshot,
      currentStep: 0,
      stepResults: [],
      stepId: "step-1",
      sessionId: "session-1",
      dialogId: "dialog-1",
      scorePercent: 60,
    });
    expect(result?.currentStep).toBe(1);
    expect(result?.status).toBe("in_progress");
    expect(result?.eventName).toBe("coaching_path_step_passed");
  });

  test("completes the path once the final step passes", () => {
    const finishedAt = new Date("2026-08-29T18:00:00.000Z");
    const result = advanceCoachingPath({
      snapshot,
      currentStep: 1,
      stepResults: [],
      stepId: "step-2",
      sessionId: "session-2",
      dialogId: "dialog-2",
      scorePercent: 91,
      completedAt: finishedAt,
    });
    expect(result?.currentStep).toBe(2);
    expect(result?.status).toBe("completed");
    expect(result?.completedAt).toEqual(finishedAt);
  });

  test("ignores a duplicate dialog result", () => {
    const first = advanceCoachingPath({
      snapshot,
      currentStep: 0,
      stepResults: [],
      stepId: "step-1",
      sessionId: "session-1",
      dialogId: "dialog-1",
      scorePercent: 80,
    });
    expect(first).not.toBeNull();
    const duplicate = advanceCoachingPath({
      snapshot,
      currentStep: 1,
      stepResults: first?.stepResults ?? [],
      stepId: "step-1",
      sessionId: "session-1",
      dialogId: "dialog-1",
      scorePercent: 80,
    });
    expect(duplicate).toBeNull();
  });
});
