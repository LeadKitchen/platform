import { describeStrategies } from "@acme/ai";
import {
  COMPETENCE_LABELS,
  CRITERIA,
  EMPLOYEE_LEVELS,
  LEVEL_LABELS,
  MANAGEMENT_STYLES,
  STYLE_LABELS,
} from "@acme/game";
import { loadCatalog, loadVariants } from "../../game/service";
import { protectedProcedure } from "../../orpc";

/**
 * Reference data for the platform UI: who can be assigned what, and what the
 * methodology dictionary looks like.
 *
 * @example client.game.catalog.reference()
 */
export const reference = protectedProcedure.handler(async ({ context }) => {
  const catalog = await loadCatalog(context.db);

  return {
    employees: catalog.employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      role: employee.role,
      level: employee.level,
      levelLabel: LEVEL_LABELS[employee.level],
      competences: employee.competences,
    })),
    tasks: catalog.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      type: task.type,
      complexity: task.complexity,
      timeCriticality: task.timeCriticality,
      requiresCheckpoints: task.requiresCheckpoints,
    })),
  };
});

/**
 * The methodology dictionary — styles, levels, competence states and the
 * criteria the score is built from.
 *
 * @example client.game.catalog.methodology()
 */
export const methodology = protectedProcedure.handler(() => ({
  styles: MANAGEMENT_STYLES.map((style) => ({
    id: style,
    label: STYLE_LABELS[style],
  })),
  levels: EMPLOYEE_LEVELS.map((level) => ({
    id: level,
    label: LEVEL_LABELS[level],
  })),
  competences: Object.entries(COMPETENCE_LABELS).map(([id, label]) => ({
    id,
    label,
  })),
  criteria: Object.values(CRITERIA),
}));

/**
 * Approaches available to a session: which experiment arms are switched on and
 * which strategy implementations exist behind them.
 *
 * @example client.game.catalog.variants()
 */
export const variants = protectedProcedure.handler(async ({ context }) => ({
  variants: await loadVariants(context.db),
  strategies: describeStrategies(),
}));

export const gameCatalogRouter = { reference, methodology, variants };
