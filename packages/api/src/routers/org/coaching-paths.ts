import {
  and,
  asc,
  count,
  desc,
  eq,
  GameCoachingPath,
  GameCoachingPathAssignment,
  type GameCoachingPathStep,
  GameOrgMember,
  inArray,
  user,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requireFacilitatorOrgId } from "../../game/organizations";
import {
  resolveRoleplayScenario,
  snapshotRoleplayScenario,
} from "../../game/roleplay";
import { loadCatalog } from "../../game/service";
import { protectedProcedure } from "../../orpc";

const stepInput = z.object({
  id: z.string().min(1).max(80),
  scenarioId: z.string().min(1),
  minScore: z.number().int().min(0).max(100),
});

const pathFields = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(""),
  steps: z.array(stepInput).min(1).max(10),
  isActive: z.boolean().default(true),
});

async function buildSteps(
  db: Parameters<typeof loadCatalog>[0],
  userId: string,
  inputs: z.infer<typeof stepInput>[],
): Promise<GameCoachingPathStep[]> {
  const catalog = await loadCatalog(db);
  return Promise.all(
    inputs.map(async (step) => ({
      id: step.id,
      minScore: step.minScore,
      scenario: snapshotRoleplayScenario(
        await resolveRoleplayScenario(db, catalog, step.scenarioId, userId),
      ),
    })),
  );
}

async function assertPath(
  db: Parameters<typeof loadCatalog>[0],
  orgId: string,
  id: string,
) {
  const [path] = await db
    .select()
    .from(GameCoachingPath)
    .where(
      and(
        eq(GameCoachingPath.id, id),
        eq(GameCoachingPath.orgId, orgId),
        eq(GameCoachingPath.isArchived, false),
      ),
    )
    .limit(1);
  if (!path)
    throw new ORPCError("NOT_FOUND", { message: "Путь обучения не найден" });
  return path;
}

export const list = protectedProcedure.handler(async ({ context }) => {
  const orgId = await requireFacilitatorOrgId(
    context.db,
    context.session.user.id,
  );
  const [paths, assignmentStats] = await Promise.all([
    context.db
      .select()
      .from(GameCoachingPath)
      .where(
        and(
          eq(GameCoachingPath.orgId, orgId),
          eq(GameCoachingPath.isArchived, false),
        ),
      )
      .orderBy(desc(GameCoachingPath.updatedAt)),
    context.db
      .select({
        pathId: GameCoachingPathAssignment.pathId,
        status: GameCoachingPathAssignment.status,
        total: count(),
      })
      .from(GameCoachingPathAssignment)
      .where(eq(GameCoachingPathAssignment.orgId, orgId))
      .groupBy(
        GameCoachingPathAssignment.pathId,
        GameCoachingPathAssignment.status,
      ),
  ]);
  const stats = new Map<string, { assigned: number; completed: number }>();
  for (const row of assignmentStats) {
    const current = stats.get(row.pathId) ?? { assigned: 0, completed: 0 };
    current.assigned += row.total;
    if (row.status === "completed") current.completed += row.total;
    stats.set(row.pathId, current);
  }
  return paths.map((path) => ({
    ...path,
    assignedCount: stats.get(path.id)?.assigned ?? 0,
    completedCount: stats.get(path.id)?.completed ?? 0,
  }));
});

export const byId = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const path = await assertPath(context.db, orgId, input.id);
    const assignments = await context.db
      .select({
        assignment: GameCoachingPathAssignment,
        participant: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      })
      .from(GameCoachingPathAssignment)
      .innerJoin(user, eq(user.id, GameCoachingPathAssignment.participantId))
      .where(eq(GameCoachingPathAssignment.pathId, path.id))
      .orderBy(desc(GameCoachingPathAssignment.createdAt));
    return { path, assignments };
  });

export const create = protectedProcedure
  .input(pathFields)
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const steps = await buildSteps(
      context.db,
      context.session.user.id,
      input.steps,
    );
    const [created] = await context.db
      .insert(GameCoachingPath)
      .values({ ...input, steps, orgId, createdBy: context.session.user.id })
      .returning();
    if (!created) throw new Error("Не удалось создать путь обучения");
    return { ...created, assignedCount: 0 };
  });

export const update = protectedProcedure
  .input(pathFields.extend({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    await assertPath(context.db, orgId, input.id);
    const steps = await buildSteps(
      context.db,
      context.session.user.id,
      input.steps,
    );
    const { id, ...values } = input;
    const [updated] = await context.db
      .update(GameCoachingPath)
      .set({ ...values, steps })
      .where(eq(GameCoachingPath.id, id))
      .returning();
    if (!updated) throw new Error("Не удалось обновить путь обучения");
    return updated;
  });

export const archive = protectedProcedure
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    await assertPath(context.db, orgId, input.id);
    await context.db
      .update(GameCoachingPath)
      .set({ isArchived: true, isActive: false })
      .where(eq(GameCoachingPath.id, input.id));
    return { id: input.id };
  });

export const members = protectedProcedure.handler(async ({ context }) => {
  const orgId = await requireFacilitatorOrgId(
    context.db,
    context.session.user.id,
  );
  return context.db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(GameOrgMember)
    .innerJoin(user, eq(user.id, GameOrgMember.userId))
    .where(eq(GameOrgMember.orgId, orgId))
    .orderBy(asc(user.name));
});

export const assign = protectedProcedure
  .input(
    z.object({
      pathId: z.uuid(),
      participantIds: z.array(z.string().min(1)).min(1).max(200),
    }),
  )
  .handler(async ({ context, input }) => {
    const orgId = await requireFacilitatorOrgId(
      context.db,
      context.session.user.id,
    );
    const path = await assertPath(context.db, orgId, input.pathId);
    if (!path.isActive) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Сначала активируйте путь обучения",
      });
    }
    const members = await context.db
      .select({ id: GameOrgMember.userId })
      .from(GameOrgMember)
      .where(
        and(
          eq(GameOrgMember.orgId, orgId),
          inArray(GameOrgMember.userId, input.participantIds),
        ),
      );
    if (members.length !== new Set(input.participantIds).size) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Один из участников не состоит в команде",
      });
    }
    const snapshot = {
      name: path.name,
      description: path.description,
      steps: path.steps,
    };
    let assigned = 0;
    for (const participantId of new Set(input.participantIds)) {
      try {
        await context.db.insert(GameCoachingPathAssignment).values({
          pathId: path.id,
          orgId,
          participantId,
          assignedBy: context.session.user.id,
          pathSnapshot: snapshot,
        });
        assigned += 1;
      } catch (cause) {
        if (
          !(cause instanceof Error) ||
          !("code" in cause) ||
          cause.code !== "23505"
        )
          throw cause;
      }
    }
    return { assigned, skipped: input.participantIds.length - assigned };
  });

export const orgCoachingPathsRouter = {
  list,
  byId,
  create,
  update,
  archive,
  members,
  assign,
};
