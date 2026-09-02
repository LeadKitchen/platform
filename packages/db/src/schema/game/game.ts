import { sql } from "drizzle-orm";
import { index, pgTable, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

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
  /** Drives which TTS voice reads the character's lines. */
  gender: t.varchar({ length: 8 }).$type<"male" | "female">().notNull(),
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

export interface GameRoleplayScenarioSnapshot {
  id: string;
  source: "template" | "custom";
  title: string;
  baseEmployeeId: string;
  baseTaskId: string;
  employeeName: string;
  employeeRole: string;
  employeeLevel: "L1" | "L2" | "L3" | "L4";
  category: "tasking" | "feedback" | "resistance" | "overload" | "delegation";
  description: string;
  trainingObjectives: string[];
  objections: string[];
  privateBeliefs: string[];
  isFavorite: boolean;
}

export interface GameCoachingPathStep {
  id: string;
  scenario: GameRoleplayScenarioSnapshot;
  minScore: number;
}

/** Immutable version assigned to a participant. */
export interface GameCoachingPathSnapshot {
  name: string;
  description: string;
  steps: GameCoachingPathStep[];
}

export interface GameCoachingPathStepResult {
  stepId: string;
  sessionId: string;
  dialogId: string;
  scorePercent: number;
  passed: boolean;
  completedAt: string;
}

export interface GameScorecardCriterion {
  criterionId: string;
  title: string;
  description: string;
  weight: number;
  required: boolean;
  scoring: "percent" | "pass_fail";
  condition?: string;
}

export interface GameScorecardCategory {
  id: string;
  name: string;
  weight: number;
  criteria: GameScorecardCriterion[];
}

/** Immutable rubric attached to a session when it starts. */
export interface GameScorecardSnapshot {
  id: string;
  name: string;
  description: string;
  categories: GameScorecardCategory[];
}

export const GameSession = pgTable(
  "game_sessions",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    title: t.varchar({ length: 256 }).notNull(),
    /** 2 or 3 — round 1 does not use the AI module. */
    round: t.integer().notNull(),
    variantId: t.text().references(() => GameVariant.id),
    status: t.varchar({ length: 32 }).default("active").notNull(),
    /** Participant who opened the session. */
    createdBy: t.text().references(() => user.id, { onDelete: "set null" }),
    /** Optional facilitator-assigned practice that this session fulfils. */
    trainingAssignmentId: t.uuid().references(() => GameTrainingAssignment.id, {
      onDelete: "set null",
    }),
    /** Ordered coaching journey that this roleplay attempt advances. */
    coachingPathAssignmentId: t
      .uuid()
      .references(() => GameCoachingPathAssignment.id, {
        onDelete: "set null",
      }),
    coachingPathStepId: t.text(),
    /** Scenario from the participant-facing AI roleplay library. */
    roleplayScenarioId: t.text(),
    /** Immutable scenario data used when continuing a roleplay session. */
    roleplayScenarioSnapshot: t.jsonb().$type<GameRoleplayScenarioSnapshot>(),
    /** Whether the participant practises a full conversation or objections. */
    roleplayMode: t.varchar({ length: 32 }),
    /** Custom evaluation rubric fixed for the lifetime of this session. */
    scorecardId: t
      .uuid()
      .references(() => GameScorecard.id, { onDelete: "set null" }),
    scorecardSnapshot: t.jsonb().$type<GameScorecardSnapshot>(),
    /**
     * Org the creator belonged to at the time (via `GameOrgMember`), copied
     * onto the row so a session keeps its group even if membership changes
     * later. Null for participants outside any organization.
     */
    orgId: t.text().references(() => GameOrganization.id, {
      onDelete: "set null",
    }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    endedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    index("game_sessions_variant_idx").on(table.variantId),
    index("game_sessions_org_idx").on(table.orgId),
    index("game_sessions_roleplay_scenario_idx").on(table.roleplayScenarioId),
    index("game_sessions_scorecard_idx").on(table.scorecardId),
    index("game_sessions_coaching_path_assignment_idx").on(
      table.coachingPathAssignmentId,
    ),
  ],
);

/**
 * A company or team the platform is deployed for. Facilitators see and
 * export only the sessions played under their own organization.
 */
export const GameOrganization = pgTable("game_organizations", (t) => ({
  id: t.text().primaryKey(),
  name: t.varchar({ length: 128 }).notNull(),
  description: t.varchar({ length: 256 }).default("").notNull(),
  createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
}));

/** Organization-owned evaluation rubrics. Only one can be active at a time. */
export const GameScorecard = pgTable(
  "game_scorecards",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    createdBy: t.text().references(() => user.id, { onDelete: "set null" }),
    name: t.varchar({ length: 160 }).notNull(),
    description: t.text().default("").notNull(),
    categories: t.jsonb().$type<GameScorecardCategory[]>().notNull(),
    isActive: t.boolean().default(false).notNull(),
    isArchived: t.boolean().default(false).notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    index("game_scorecards_org_idx").on(table.orgId, table.updatedAt),
    uniqueIndex("game_scorecards_active_org_idx")
      .on(table.orgId)
      .where(sql`${table.isActive} = true and ${table.isArchived} = false`),
  ],
);

/**
 * Participant-owned scenarios for the AI roleplay library.
 *
 * Built-in templates stay in application code so they can evolve with the
 * methodical catalog. This table stores only scenarios created by users; a
 * session keeps the scenario key as a snapshot link even when it is archived.
 */
export const GameRoleplayScenario = pgTable(
  "game_roleplay_scenarios",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    createdBy: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: t.text().references(() => GameOrganization.id, {
      onDelete: "set null",
    }),
    baseEmployeeId: t
      .text()
      .notNull()
      .references(() => GameEmployee.id),
    baseTaskId: t
      .text()
      .notNull()
      .references(() => GameTask.id),
    title: t.varchar({ length: 180 }).notNull(),
    employeeName: t.varchar({ length: 128 }).notNull(),
    employeeRole: t.varchar({ length: 128 }).notNull(),
    employeeLevel: t.varchar({ length: 8 }).notNull(),
    category: t.varchar({ length: 48 }).notNull(),
    description: t.text().notNull(),
    trainingObjectives: t.jsonb().$type<string[]>().default([]).notNull(),
    objections: t.jsonb().$type<string[]>().default([]).notNull(),
    privateBeliefs: t.jsonb().$type<string[]>().default([]).notNull(),
    isFavorite: t.boolean().default(false).notNull(),
    isArchived: t.boolean().default(false).notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    index("game_roleplay_scenarios_creator_idx").on(table.createdBy),
    index("game_roleplay_scenarios_org_idx").on(table.orgId),
  ],
);

/**
 * Which workspaces a user belongs to. A composite key lets a person be a
 * member of several teams without duplicating their profile.
 */
export const GameOrgMember = pgTable(
  "game_org_members",
  (t) => ({
    userId: t
      .text()
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [primaryKey({ columns: [table.userId, table.orgId] })],
);

/**
 * Facilitator grant, scoped to one org. Mirrors `AppAdmin`'s "row exists =
 * privilege" pattern — a facilitator is not a global role, so it needs the
 * org on the grant itself rather than a boolean.
 */
export const GameFacilitator = pgTable(
  "game_facilitators",
  (t) => ({
    userId: t
      .text()
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    grantedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [primaryKey({ columns: [table.userId, table.orgId] })],
);

/** The workspace currently selected in the sidebar for a user. */
export const GameActiveOrganization = pgTable(
  "game_active_organizations",
  (t) => ({
    userId: t
      .text()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [index("game_active_organizations_org_idx").on(table.orgId)],
);

/** Team-owned configuration used by scorecards, scenario context and routing. */
export const GameOrganizationConfigure = pgTable(
  "game_organization_configure",
  (t) => ({
    orgId: t
      .text()
      .primaryKey()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    context: t.jsonb().$type<Record<string, string>>().default({}).notNull(),
    scorecard: t
      .jsonb()
      .$type<{ criterionIds: string[]; name: string }>()
      .default({ name: "Общая рубрика", criterionIds: [] })
      .notNull(),
    automation: t
      .jsonb()
      .$type<{ enabled: boolean; threshold: number }>()
      .default({ enabled: false, threshold: 60 })
      .notNull(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => sql`now()`),
  }),
);

/**
 * A focused practice request from a facilitator to one participant.
 *
 * It deliberately stores the criterion label in addition to its id: the
 * learning brief remains readable even if the methodology dictionary is
 * revised later.
 */
export const GameTrainingAssignment = pgTable(
  "game_training_assignments",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    participantId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assignedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    criterionId: t.varchar({ length: 64 }).notNull(),
    criterionTitle: t.varchar({ length: 256 }).notNull(),
    status: t
      .varchar({ length: 32 })
      .$type<"assigned" | "in_progress" | "completed">()
      .default("assigned")
      .notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    startedAt: t.timestamp({ withTimezone: true }),
    completedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    index("game_training_assignments_org_idx").on(table.orgId),
    index("game_training_assignments_participant_idx").on(
      table.participantId,
      table.status,
    ),
    uniqueIndex("game_training_assignments_active_idx")
      .on(table.orgId, table.participantId, table.criterionId)
      .where(sql`${table.status} in ('assigned', 'in_progress')`),
  ],
);

/** Facilitator-authored ordered journey through AI roleplay scenarios. */
export const GameCoachingPath = pgTable(
  "game_coaching_paths",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    createdBy: t.text().references(() => user.id, { onDelete: "set null" }),
    name: t.varchar({ length: 160 }).notNull(),
    description: t.text().default("").notNull(),
    steps: t.jsonb().$type<GameCoachingPathStep[]>().notNull(),
    isActive: t.boolean().default(true).notNull(),
    isArchived: t.boolean().default(false).notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    index("game_coaching_paths_org_idx").on(table.orgId, table.updatedAt),
  ],
);

/** Participant progress through an immutable snapshot of a coaching path. */
export const GameCoachingPathAssignment = pgTable(
  "game_coaching_path_assignments",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    pathId: t
      .uuid()
      .notNull()
      .references(() => GameCoachingPath.id, { onDelete: "cascade" }),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    participantId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assignedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    pathSnapshot: t.jsonb().$type<GameCoachingPathSnapshot>().notNull(),
    status: t
      .varchar({ length: 32 })
      .$type<"assigned" | "in_progress" | "completed">()
      .default("assigned")
      .notNull(),
    currentStep: t.integer().default(0).notNull(),
    stepResults: t
      .jsonb()
      .$type<GameCoachingPathStepResult[]>()
      .default([])
      .notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    startedAt: t.timestamp({ withTimezone: true }),
    completedAt: t.timestamp({ withTimezone: true }),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    index("game_coaching_path_assignments_org_idx").on(table.orgId),
    index("game_coaching_path_assignments_participant_idx").on(
      table.participantId,
      table.status,
    ),
    uniqueIndex("game_coaching_path_assignments_active_idx")
      .on(table.pathId, table.participantId)
      .where(sql`${table.status} in ('assigned', 'in_progress')`),
  ],
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

/**
 * One offline benchmark run (`@acme/eval`'s harness), published for the admin
 * panel.
 *
 * The harness itself only ever produces local `reports/*.json` files — this
 * table is what makes a run visible to a customer without giving them shell
 * access. `result` stores the harness's `RunResult` verbatim (comparisons,
 * per-variant summaries, pool stats, failures) so the report page never has
 * to duplicate the harness's own scoring or significance logic.
 */
export const GameBenchmarkRun = pgTable(
  "game_benchmark_runs",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    /** Short human label, e.g. the source report's file name. */
    label: t.varchar({ length: 128 }).notNull(),
    /** `RunResult` from `@acme/eval`, stored as-is. */
    result: t.jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [index("game_benchmark_runs_created_idx").on(table.createdAt)],
);

/**
 * A written review report of an external/reference implementation, published
 * for the admin panel.
 *
 * Unlike `GameBenchmarkRun` (machine-measured numbers), this holds
 * human-authored analysis as markdown — findings, reproduced defects,
 * recommended fixes — produced offline and pasted in verbatim, the same way
 * benchmark runs are published rather than recomputed in the browser.
 */
export const GameReviewReport = pgTable(
  "game_review_reports",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    /**
     * Which admin section this report belongs to: a standalone technical
     * review of the legacy implementation, or a side-by-side comparison
     * report against the Sitruk architecture. Same table, two sections —
     * avoids duplicating the whole publish/list/render stack for one extra
     * document type.
     */
    kind: t
      .varchar({ length: 32 })
      .$type<"legacy-review" | "comparison">()
      .notNull()
      .default("legacy-review"),
    /** Short title shown in the report list. */
    title: t.varchar({ length: 200 }).notNull(),
    /** One-line description shown under the title. */
    summary: t.varchar({ length: 400 }).notNull().default(""),
    /** Full report body, markdown. */
    content: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [
    index("game_review_reports_created_idx").on(table.createdAt),
    index("game_review_reports_kind_idx").on(table.kind),
  ],
);

/**
 * Who may see a piece of retrieved knowledge.
 *
 * `judge` covers content that would hand the participant the answer if the
 * character could see it (scoring methodology, expected style, readiness
 * levels). Mirrors the `audience` field on the built-in `KnowledgeDoc`
 * corpus (`packages/ai/src/knowledge/corpus.ts`) — any retrieval strategy
 * reading from this table must apply the same filter before the character
 * prompt sees a snippet.
 */
export type GameKnowledgeAudience = "character" | "judge" | "both";

/**
 * An admin-uploaded knowledge source (PDF/DOCX/plain text) for one
 * organization's RAG-fed "virtual employee". The file itself lives in S3
 * (`s3Key`); this row tracks ingestion status and the org-wide default
 * audience for chunks that don't override it.
 */
export const GameKnowledgeDocument = pgTable(
  "game_knowledge_documents",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    title: t.varchar({ length: 200 }).notNull(),
    sourceType: t
      .varchar({ length: 16 })
      .$type<"pdf" | "docx" | "txt">()
      .notNull(),
    s3Key: t.text().notNull(),
    /**
     * `needs_review`: ingested and chunked, but the LLM-suggested audience
     * labels have not been confirmed by an admin yet — excluded from
     * retrieval until then. `ready` is the only status `org-rag` reads from.
     */
    status: t
      .varchar({ length: 16 })
      .$type<"processing" | "needs_review" | "ready" | "failed">()
      .default("processing")
      .notNull(),
    /** Parse/ingestion failure reason, shown to the admin. */
    statusMessage: t.text(),
    /** Default for chunks that don't set their own `audience`. */
    audience: t
      .varchar({ length: 16 })
      .$type<GameKnowledgeAudience>()
      .default("character")
      .notNull(),
    /** Bumped on re-upload; old chunks are replaced, not appended. */
    version: t.integer().default(1).notNull(),
    uploadedBy: t.text().references(() => user.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    index("game_knowledge_documents_org_idx").on(table.orgId, table.createdAt),
  ],
);

/**
 * One retrieval-sized fragment of an uploaded document, embedded for dense
 * search. `orgId` is denormalized from the parent document so the org-rag
 * strategy can filter by org (and by `audience`) without a join on the hot
 * retrieval path.
 */
export const GameKnowledgeChunk = pgTable(
  "game_knowledge_chunks",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    documentId: t
      .uuid()
      .notNull()
      .references(() => GameKnowledgeDocument.id, { onDelete: "cascade" }),
    orgId: t
      .text()
      .notNull()
      .references(() => GameOrganization.id, { onDelete: "cascade" }),
    chunkIndex: t.integer().notNull(),
    text: t.text().notNull(),
    /** May override the parent document's default for mixed-content docs. */
    audience: t
      .varchar({ length: 16 })
      .$type<GameKnowledgeAudience>()
      .notNull(),
    tags: t.jsonb().$type<string[]>().default([]).notNull(),
    /** text-embedding-3-small is 1536-dimensional. */
    embedding: t.vector("embedding", { dimensions: 1536 }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [
    index("game_knowledge_chunks_document_idx").on(table.documentId),
    index("game_knowledge_chunks_org_audience_idx").on(
      table.orgId,
      table.audience,
    ),
  ],
);

export const GameEvaluation = pgTable(
  "game_evaluations",
  (t) => ({
    id: t.uuid().primaryKey().defaultRandom(),
    dialogId: t
      .uuid()
      .notNull()
      .references(() => GameDialog.id, { onDelete: "cascade" }),
    variantId: t.text().notNull(),
    scorecardId: t
      .uuid()
      .references(() => GameScorecard.id, { onDelete: "set null" }),
    scorecardName: t.varchar({ length: 160 }),
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
