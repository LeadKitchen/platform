import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../auth/user";

/**
 * Persistence for the "Ситуационное руководство" AI module.
 *
 * Two design points worth keeping in mind when extending this schema:
 *
 * 1. `gameEvent` is an append-only log. Dialog state (`gameDialog`) and scores
 *    (`gameEvaluation`) are projections of it, so a crash mid-dialog loses at
 *    most the projection, never the transcript — the reliability NFR.
 * 2. Every dialog records the `variantId` it ran under. That single column is
 *    what turns "we plugged in GraphRAG" into a measurable claim.
 */

export const GameEmployee = pgTable("game_employees", (t) => ({
  /** Stable slug, e.g. "anna". Matches the catalog in `@acme/game`. */
  id: t.text().primaryKey(),
  name: t.varchar({ length: 128 }).notNull(),
  role: t.varchar({ length: 128 }).notNull(),
  level: t.varchar({ length: 8 }).notNull(),
  /** Record<taskType, CompetenceState>. */
  competences: t.jsonb().$type<Record<string, string>>().notNull(),
  personality: t.jsonb().$type<Record<string, unknown>>().notNull(),
  isActive: t.boolean().default(true).notNull(),
  createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const GameTask = pgTable("game_tasks", (t) => ({
  id: t.text().primaryKey(),
  title: t.varchar({ length: 256 }).notNull(),
  type: t.varchar({ length: 64 }).notNull(),
  complexity: t.integer().notNull(),
  timeCriticality: t.integer().notNull(),
  requiresCheckpoints: t.boolean().default(false).notNull(),
  failureModes: t.jsonb().$type<string[]>().notNull(),
  isActive: t.boolean().default(true).notNull(),
  createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
}));

/** One experiment arm: which strategy runs at each pipeline stage. */
export const GameVariant = pgTable("game_variants", (t) => ({
  id: t.text().primaryKey(),
  name: t.varchar({ length: 128 }).notNull(),
  description: t.text().default("").notNull(),
  engagement: t.varchar({ length: 64 }).default("heuristic").notNull(),
  knowledge: t.varchar({ length: 64 }).notNull(),
  persona: t.varchar({ length: 64 }).notNull(),
  evaluation: t.varchar({ length: 64 }).notNull(),
  model: t.varchar({ length: 64 }),
  effort: t.varchar({ length: 16 }),
  params: t.jsonb().$type<Record<string, unknown>>().default({}).notNull(),
  /** Only active variants are offered to new sessions. */
  isActive: t.boolean().default(true).notNull(),
  /** Relative share when a session picks a variant at random (A/B split). */
  weight: t.integer().default(1).notNull(),
  createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

/** Singleton configuration edited from the admin panel. */
export const GameSettings = pgTable("game_settings", (t) => ({
  /** Always `global`; a key keeps the shape extensible without extra rows. */
  id: t.text().primaryKey(),
  defaultVariantId: t.text().references(() => GameVariant.id, {
    onDelete: "set null",
  }),
  defaultRound: t.integer().default(2).notNull(),
  defaultDeadlineMinutes: t.integer().default(60).notNull(),
  allowRoundThree: t.boolean().default(true).notNull(),
  maxActiveSessions: t.integer().default(20).notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => sql`now()`),
}));

export const GameSession = pgTable(
  "game_sessions",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    title: t.varchar({ length: 256 }).notNull(),
    /** 2 or 3 — round 1 does not use the AI module. */
    round: t.integer().notNull(),
    variantId: t.text().references(() => GameVariant.id),
    status: t.varchar({ length: 32 }).default("active").notNull(),
    /** Facilitator who opened the session. */
    createdBy: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    endedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [index("game_sessions_variant_idx").on(table.variantId)],
);

/** Product events are separate from the replayable in-dialog event stream. */
export const GameProductEvent = pgTable(
  "game_product_events",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    sessionId: t.uuid().references(() => GameSession.id, {
      onDelete: "cascade",
    }),
    dialogId: t.uuid(),
    name: t.varchar({ length: 64 }).notNull(),
    properties: t
      .jsonb()
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [
    index("game_product_events_name_idx").on(table.name),
    index("game_product_events_user_idx").on(table.userId),
  ],
);

/** Immutable before/after snapshots for every game-configuration mutation. */
export const GameConfigVersion = pgTable(
  "game_config_versions",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    actorId: t.text().references(() => user.id, { onDelete: "set null" }),
    source: t.varchar({ length: 32 }).notNull(),
    summary: t.varchar({ length: 600 }).notNull(),
    beforeSnapshot: t.jsonb().$type<Record<string, unknown>>().notNull(),
    afterSnapshot: t.jsonb().$type<Record<string, unknown>>().notNull(),
    revertedVersionId: t.uuid(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [index("game_config_versions_created_idx").on(table.createdAt)],
);

export const GameOrder = pgTable(
  "game_orders",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => GameSession.id, { onDelete: "cascade" }),
    taskId: t
      .text()
      .notNull()
      .references(() => GameTask.id),
    employeeId: t
      .text()
      .notNull()
      .references(() => GameEmployee.id),
    portions: t.integer().default(1).notNull(),
    deadlineMinutes: t.integer().default(60).notNull(),
    notes: t.text(),
    status: t.varchar({ length: 32 }).default("queued").notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [index("game_orders_session_idx").on(table.sessionId)],
);

export const GameDialog = pgTable(
  "game_dialogs",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    sessionId: t
      .uuid()
      .notNull()
      .references(() => GameSession.id, { onDelete: "cascade" }),
    orderId: t
      .uuid()
      .notNull()
      .references(() => GameOrder.id, { onDelete: "cascade" }),
    employeeId: t
      .text()
      .notNull()
      .references(() => GameEmployee.id),
    taskId: t
      .text()
      .notNull()
      .references(() => GameTask.id),
    round: t.integer().notNull(),
    /** The approach this dialog ran under — the key to all comparisons. */
    variantId: t.text().notNull(),
    status: t.varchar({ length: 32 }).default("active").notNull(),
    /** Whether the manager has pulled the character into the conversation. */
    engaged: t.boolean().default(false).notNull(),
    emotion: t.integer().default(0).notNull(),
    /** Queue length and load at the time the dialog started. */
    activeOrders: t.integer().default(1).notNull(),
    soloOnShift: t.boolean().default(false).notNull(),
    startedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    endedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    index("game_dialogs_session_idx").on(table.sessionId),
    index("game_dialogs_variant_idx").on(table.variantId),
  ],
);

/**
 * Append-only event log. `seq` is per dialog and monotonically increasing, so
 * the transcript can always be replayed in order even if rows arrive late.
 */
export const GameEvent = pgTable(
  "game_events",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    dialogId: t
      .uuid()
      .notNull()
      .references(() => GameDialog.id, { onDelete: "cascade" }),
    seq: t.integer().notNull(),
    /**
     * "manager_utterance" | "employee_reply" | "employee_silent" |
     * "evaluation" | "error"
     */
    type: t.varchar({ length: 48 }).notNull(),
    payload: t.jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [
    uniqueIndex("game_events_dialog_seq_idx").on(table.dialogId, table.seq),
  ],
);

/**
 * Persisted state of the skill-RL contextual bandit (`skill-rl` persona).
 *
 * Without this table the policy lived only in a process-local `Map`: every
 * deploy reset it to the optimistic initial value, so a "learning curve"
 * shown to the facilitator was really measuring process uptime. Learning is
 * deliberately shared across every session on the variant — the whole point
 * of a bandit is that later games benefit from earlier ones — this table just
 * makes that survive a restart.
 */
export const GameSkillPolicy = pgTable("game_skill_policy", (t) => ({
  /** `${contextKey}::${skillId}`, matches `SkillPolicyStore` in @acme/ai. */
  key: t.text().primaryKey(),
  value: t.doublePrecision().notNull(),
  count: t.integer().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => sql`now()`),
}));

export const GameEvaluation = pgTable(
  "game_evaluations",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    dialogId: t
      .uuid()
      .notNull()
      .references(() => GameDialog.id, { onDelete: "cascade" }),
    variantId: t.text().notNull(),
    scorePercent: t.integer().notNull(),
    expectedStyle: t.varchar({ length: 32 }).notNull(),
    actualStyle: t.varchar({ length: 32 }).notNull(),
    styleDistribution: t.jsonb().$type<Record<string, number>>().notNull(),
    criteria: t.jsonb().$type<unknown[]>().notNull(),
    outcome: t.jsonb().$type<Record<string, unknown>>().notNull(),
    breakdown: t.jsonb().$type<Record<string, number>>().notNull(),
    summary: t.text().notNull(),
    /** Telemetry for cost/latency comparison between variants. */
    latencyMs: t.integer().default(0).notNull(),
    inputTokens: t.integer().default(0).notNull(),
    outputTokens: t.integer().default(0).notNull(),
    costUsd: t.doublePrecision().default(0).notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [
    uniqueIndex("game_evaluations_dialog_idx").on(table.dialogId),
    index("game_evaluations_variant_idx").on(table.variantId),
  ],
);
