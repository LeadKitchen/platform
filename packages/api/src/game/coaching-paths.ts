import type {
  GameCoachingPathSnapshot,
  GameCoachingPathStepResult,
} from "@acme/db";

export function advanceCoachingPath(input: {
  snapshot: GameCoachingPathSnapshot;
  currentStep: number;
  stepResults: GameCoachingPathStepResult[];
  stepId: string;
  sessionId: string;
  dialogId: string;
  scorePercent: number;
  completedAt?: Date;
}) {
  if (input.stepResults.some((item) => item.dialogId === input.dialogId)) {
    return null;
  }
  const step = input.snapshot.steps.find((item) => item.id === input.stepId);
  const current = input.snapshot.steps[input.currentStep];
  const minScore = step?.minScore ?? 60;
  const passed = input.scorePercent >= minScore;
  const advancesCurrent = passed && current?.id === input.stepId;
  const currentStep = advancesCurrent
    ? input.currentStep + 1
    : input.currentStep;
  const completed = currentStep >= input.snapshot.steps.length;
  const completedAt = input.completedAt ?? new Date();
  const result: GameCoachingPathStepResult = {
    stepId: input.stepId,
    sessionId: input.sessionId,
    dialogId: input.dialogId,
    scorePercent: input.scorePercent,
    passed,
    completedAt: completedAt.toISOString(),
  };
  return {
    result,
    stepResults: [...input.stepResults, result],
    currentStep,
    status: completed ? ("completed" as const) : ("in_progress" as const),
    completedAt: completed ? completedAt : null,
    minScore,
    eventName: completed
      ? "coaching_path_completed"
      : passed
        ? "coaching_path_step_passed"
        : "coaching_path_step_retry",
  };
}
