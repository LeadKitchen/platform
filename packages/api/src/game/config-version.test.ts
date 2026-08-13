import { describe, expect, it } from "bun:test";

import {
  type ConfigSnapshot,
  configRevision,
  diffSnapshots,
} from "./config-version";

function snapshot(): ConfigSnapshot {
  return {
    settings: {
      defaultVariantId: "control",
      defaultRound: 2,
      defaultDeadlineMinutes: 60,
      allowRoundThree: true,
      maxActiveSessions: 20,
    },
    employees: [
      {
        id: "anna",
        name: "Анна",
        role: "Стажёр",
        level: "R2",
        competences: { prep: "D2" },
        personality: {},
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: null,
      },
    ],
    tasks: [],
    variants: [],
  };
}

describe("diffSnapshots", () => {
  it("treats database dates and JSON-restored dates as equal", () => {
    const before = snapshot();
    const after = JSON.parse(JSON.stringify(before)) as ConfigSnapshot;

    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it("reports settings and entity changes with stable paths", () => {
    const before = snapshot();
    const after = structuredClone(before);
    after.settings.defaultRound = 3;
    const employee = after.employees[0];
    if (!employee) throw new Error("Fixture is missing an employee");
    employee.name = "Анна П.";

    expect(diffSnapshots(before, after).map((change) => change.path)).toEqual([
      "settings.defaultRound",
      "employees.anna",
    ]);
  });

  it("changes the revision when configuration content changes", () => {
    const before = snapshot();
    const after = structuredClone(before);
    after.settings.defaultDeadlineMinutes = 45;

    expect(configRevision(before)).not.toBe(configRevision(after));
    expect(configRevision(before)).toHaveLength(64);
  });

  it("keeps the revision stable when database row order changes", () => {
    const before = snapshot();
    const first = before.employees[0];
    if (!first) throw new Error("Fixture is missing an employee");
    const second = { ...first, id: "boris", name: "Борис" };
    before.employees.push(second);
    const after = structuredClone(before);
    after.employees.reverse();

    expect(configRevision(before)).toBe(configRevision(after));
  });
});
