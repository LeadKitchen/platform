import {
  and,
  count,
  eq,
  GameActiveOrganization,
  GameFacilitator,
  GameOrganization,
  GameOrgMember,
  user,
} from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { slugifyOrgId } from "../../../game/organizations";
import { adminProcedure } from "../../../orpc";

/**
 * Organizations with member/facilitator headcounts, for the admin panel.
 *
 * @example client.admin.game.organizations.list()
 */
export const list = adminProcedure.handler(async ({ context }) => {
  const [orgs, members, facilitators] = await Promise.all([
    context.db.select().from(GameOrganization),
    context.db
      .select({ orgId: GameOrgMember.orgId, count: count() })
      .from(GameOrgMember)
      .groupBy(GameOrgMember.orgId),
    context.db
      .select({ orgId: GameFacilitator.orgId, count: count() })
      .from(GameFacilitator)
      .groupBy(GameFacilitator.orgId),
  ]);

  const memberCounts = new Map(members.map((row) => [row.orgId, row.count]));
  const facilitatorCounts = new Map(
    facilitators.map((row) => [row.orgId, row.count]),
  );

  return orgs
    .map((org) => ({
      ...org,
      members: memberCounts.get(org.id) ?? 0,
      facilitators: facilitatorCounts.get(org.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
});

/**
 * Create an organization. The id is a slug derived from the name; a
 * collision appends a numeric suffix rather than failing, since admins
 * shouldn't have to think about ids at all.
 *
 * @example client.admin.game.organizations.create({ name: "Вкусно и точка" })
 */
export const create = adminProcedure
  .input(z.object({ name: z.string().trim().min(2).max(128) }))
  .handler(async ({ context, input }) => {
    const base = slugifyOrgId(input.name);
    let id = base;
    for (let suffix = 2; ; suffix++) {
      const [existing] = await context.db
        .select({ id: GameOrganization.id })
        .from(GameOrganization)
        .where(eq(GameOrganization.id, id))
        .limit(1);
      if (!existing) break;
      id = `${base}-${suffix}`;
    }

    const [org] = await context.db
      .insert(GameOrganization)
      .values({ id, name: input.name })
      .returning();
    if (!org) throw new Error("Не удалось создать организацию");
    return org;
  });

/**
 * Assign a user to an organization, or clear their membership with
 * `orgId: null`. Reassigning also drops any facilitator grant the user held
 * for a *different* org — a facilitator grant only makes sense for the org
 * the user actually belongs to.
 *
 * @example client.admin.game.organizations.setMember({ userId, orgId })
 */
export const setMember = adminProcedure
  .input(
    z.object({
      userId: z.string().min(1),
      orgId: z.string().min(1).nullable(),
    }),
  )
  .handler(async ({ context, input }) => {
    const [target] = await context.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);
    if (!target) {
      throw new ORPCError("NOT_FOUND", { message: "Пользователь не найден" });
    }

    if (input.orgId === null) {
      await context.db.transaction(async (tx) => {
        await tx
          .delete(GameOrgMember)
          .where(eq(GameOrgMember.userId, input.userId));
        await tx
          .delete(GameFacilitator)
          .where(eq(GameFacilitator.userId, input.userId));
        await tx
          .delete(GameActiveOrganization)
          .where(eq(GameActiveOrganization.userId, input.userId));
      });
      return { userId: input.userId, orgId: null };
    }

    const [org] = await context.db
      .select({ id: GameOrganization.id })
      .from(GameOrganization)
      .where(eq(GameOrganization.id, input.orgId))
      .limit(1);
    if (!org) {
      throw new ORPCError("NOT_FOUND", { message: "Организация не найдена" });
    }

    // Admin reassignment keeps its original single-team behavior, while the
    // sidebar can still add a personal workspace without collapsing data.
    const orgId = input.orgId;
    await context.db.transaction(async (tx) => {
      await tx
        .delete(GameOrgMember)
        .where(eq(GameOrgMember.userId, input.userId));
      await tx
        .delete(GameFacilitator)
        .where(eq(GameFacilitator.userId, input.userId));
      await tx.insert(GameOrgMember).values({ userId: input.userId, orgId });
      await tx
        .insert(GameActiveOrganization)
        .values({ userId: input.userId, orgId })
        .onConflictDoUpdate({
          target: GameActiveOrganization.userId,
          set: { orgId },
        });
    });

    return { userId: input.userId, orgId: input.orgId };
  });

/**
 * Grant or revoke the facilitator role for a user within their current org.
 * The user must already be a member of that org (`setMember` first).
 *
 * @example client.admin.game.organizations.setFacilitator({ userId, orgId, isFacilitator: true })
 */
export const setFacilitator = adminProcedure
  .input(
    z.object({
      userId: z.string().min(1),
      orgId: z.string().min(1),
      isFacilitator: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    if (!input.isFacilitator) {
      await context.db
        .delete(GameFacilitator)
        .where(
          and(
            eq(GameFacilitator.userId, input.userId),
            eq(GameFacilitator.orgId, input.orgId),
          ),
        );
      return { userId: input.userId, orgId: input.orgId, isFacilitator: false };
    }

    const [membership] = await context.db
      .select({ orgId: GameOrgMember.orgId })
      .from(GameOrgMember)
      .where(
        and(
          eq(GameOrgMember.userId, input.userId),
          eq(GameOrgMember.orgId, input.orgId),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Сначала добавьте пользователя в организацию",
      });
    }

    await context.db
      .insert(GameFacilitator)
      .values({
        userId: input.userId,
        orgId: membership.orgId,
        grantedBy: context.session.user.id,
      })
      .onConflictDoUpdate({
        target: [GameFacilitator.userId, GameFacilitator.orgId],
        set: { orgId: membership.orgId, grantedBy: context.session.user.id },
      });

    return { userId: input.userId, orgId: input.orgId, isFacilitator: true };
  });

export const adminGameOrganizationsRouter = {
  list,
  create,
  setMember,
  setFacilitator,
};
