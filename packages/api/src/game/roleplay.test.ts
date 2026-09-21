import { describe, expect, it } from "bun:test";
import { defaultCatalog } from "@acme/game";

import {
  applyRoleplayScenario,
  buildRoleplayNotes,
  buildRoleplayTemplates,
  loadEmployeeGenders,
  resolveRoleplayScenario,
  withRoleplayEmployeeGender,
} from "./roleplay";

describe("roleplay scenarios", () => {
  it("preserves the gender of a hidden custom employee in saved scenarios", async () => {
    const db = {
      select: () => ({
        from: async () => [{ id: "hidden-custom", gender: "female" }],
      }),
    } as never;
    const savedScenario = { baseEmployeeId: "hidden-custom" };

    const displayed = withRoleplayEmployeeGender(
      savedScenario,
      await loadEmployeeGenders(db),
    );

    expect(displayed.employeeGender).toBe("female");
    expect(savedScenario).not.toHaveProperty("employeeGender");
  });

  it("uses built-in employee genders before the database has been seeded", async () => {
    const db = {
      select: () => ({ from: async () => [] }),
    } as never;

    const displayed = withRoleplayEmployeeGender(
      { baseEmployeeId: "marina" },
      await loadEmployeeGenders(db),
    );

    expect(displayed.employeeGender).toBe("female");
  });

  it("builds templates only from available catalog entities", () => {
    const templates = buildRoleplayTemplates(defaultCatalog);

    expect(templates).toHaveLength(6);
    expect(templates.every((item) => item.id.startsWith("template:"))).toBe(
      true,
    );
    expect(
      templates.every((item) =>
        defaultCatalog.employees.some(
          (employee) => employee.id === item.baseEmployeeId,
        ),
      ),
    ).toBe(true);
  });

  it("applies scenario identity and readiness without mutating the catalog", () => {
    const scenario = buildRoleplayTemplates(defaultCatalog)[0];
    if (!scenario) throw new Error("Template missing");
    const employee = defaultCatalog.employees.find(
      (item) => item.id === scenario.baseEmployeeId,
    );
    const task = defaultCatalog.tasks.find(
      (item) => item.id === scenario.baseTaskId,
    );
    if (!employee || !task) throw new Error("Catalog entity missing");

    const applied = applyRoleplayScenario(scenario, employee, task);

    expect(applied.employee.name).toBe(scenario.employeeName);
    expect(applied.task.title).toBe(scenario.title);
    expect(applied.employee.competences[task.type]).toBe("novice");
    expect(employee.name).toBe("Денис Волков");
  });

  it("includes objectives, resistance and mode in the live prompt notes", () => {
    const scenario = buildRoleplayTemplates(defaultCatalog)[3];
    if (!scenario) throw new Error("Template missing");

    const notes = buildRoleplayNotes(scenario, "objections");

    expect(notes).toContain("Цели руководителя");
    expect(notes).toContain("Вероятные возражения");
    expect(notes).toContain("отработка возражений");
  });

  it("rejects an unknown template ID without querying custom scenarios", async () => {
    const db = {
      select() {
        throw new Error("unexpected query");
      },
    } as never;

    await expect(
      resolveRoleplayScenario(db, defaultCatalog, "template:unknown"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an invalid custom scenario UUID without querying", async () => {
    const db = {
      select() {
        throw new Error("unexpected query");
      },
    } as never;

    await expect(
      resolveRoleplayScenario(db, defaultCatalog, "not-a-uuid"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
