import {
  and,
  asc,
  type Database,
  eq,
  GameActiveOrganization,
  GameFacilitator,
  GameOrganization,
  GameOrgMember,
} from "@acme/db";
import { ORPCError } from "@orpc/server";

import { resolveIsAdmin } from "../orpc";

/** The saved sidebar selection, provided it is still a valid membership. */
async function getSavedActiveOrgId(
  db: Database,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ orgId: GameActiveOrganization.orgId })
    .from(GameActiveOrganization)
    .innerJoin(
      GameOrgMember,
      and(
        eq(GameOrgMember.userId, GameActiveOrganization.userId),
        eq(GameOrgMember.orgId, GameActiveOrganization.orgId),
      ),
    )
    .where(eq(GameActiveOrganization.userId, userId))
    .limit(1);
  return row?.orgId ?? null;
}

/**
 * The saved sidebar selection for an admin — unlike `getSavedActiveOrgId`,
 * this doesn't require the admin to actually be a member of that org, since
 * admins can browse every team.
 */
async function getSavedActiveOrgIdForAdmin(
  db: Database,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ orgId: GameActiveOrganization.orgId })
    .from(GameActiveOrganization)
    .where(eq(GameActiveOrganization.userId, userId))
    .limit(1);
  return row?.orgId ?? null;
}

/** Any org at all, used as an admin's fallback workspace. */
async function getAnyOrgId(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ id: GameOrganization.id })
    .from(GameOrganization)
    .orderBy(asc(GameOrganization.name))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Active workspace a user plays under, or `null` outside any workspace.
 * Admins aren't restricted to orgs they belong to — they fall back to their
 * last-viewed org, or the first org on the platform, so the team section is
 * never empty for them.
 */
export async function getMemberOrgId(
  db: Database,
  userId: string,
  isAdmin = false,
): Promise<string | null> {
  if (isAdmin) {
    return (
      (await getSavedActiveOrgIdForAdmin(db, userId)) ??
      (await getAnyOrgId(db))
    );
  }

  const activeOrgId = await getSavedActiveOrgId(db, userId);
  if (activeOrgId) return activeOrgId;

  const [row] = await db
    .select({ orgId: GameOrgMember.orgId })
    .from(GameOrgMember)
    .where(eq(GameOrgMember.userId, userId))
    .orderBy(asc(GameOrgMember.createdAt))
    .limit(1);
  return row?.orgId ?? null;
}

/**
 * Whether the active workspace is one the user facilitates. Admins get
 * facilitator-equivalent access to whatever workspace they're viewing,
 * regardless of membership.
 */
export async function getFacilitatorOrgId(
  db: Database,
  userId: string,
  isAdmin = false,
): Promise<string | null> {
  const orgId = await getMemberOrgId(db, userId, isAdmin);
  if (!orgId) return null;
  if (isAdmin) return orgId;

  const [row] = await db
    .select({ orgId: GameFacilitator.orgId })
    .from(GameFacilitator)
    .where(
      and(eq(GameFacilitator.userId, userId), eq(GameFacilitator.orgId, orgId)),
    )
    .limit(1);
  return row?.orgId ?? null;
}

export async function listWorkspaces(
  db: Database,
  userId: string,
  isAdmin = false,
) {
  if (isAdmin) {
    const [activeOrgId, rows] = await Promise.all([
      getMemberOrgId(db, userId, true),
      db
        .select({
          id: GameOrganization.id,
          name: GameOrganization.name,
          facilitatorUserId: GameFacilitator.userId,
        })
        .from(GameOrganization)
        .leftJoin(
          GameFacilitator,
          and(
            eq(GameFacilitator.userId, userId),
            eq(GameFacilitator.orgId, GameOrganization.id),
          ),
        )
        .orderBy(asc(GameOrganization.name)),
    ]);

    return {
      activeOrgId,
      workspaces: rows.map((row) => ({
        id: row.id,
        name: row.name,
        isFacilitator: true,
      })),
    };
  }

  const [activeOrgId, rows] = await Promise.all([
    getMemberOrgId(db, userId),
    db
      .select({
        id: GameOrganization.id,
        name: GameOrganization.name,
        facilitatorUserId: GameFacilitator.userId,
      })
      .from(GameOrgMember)
      .innerJoin(GameOrganization, eq(GameOrganization.id, GameOrgMember.orgId))
      .leftJoin(
        GameFacilitator,
        and(
          eq(GameFacilitator.userId, userId),
          eq(GameFacilitator.orgId, GameOrgMember.orgId),
        ),
      )
      .where(eq(GameOrgMember.userId, userId))
      .orderBy(asc(GameOrganization.name)),
  ]);

  return {
    activeOrgId,
    workspaces: rows.map((row) => ({
      id: row.id,
      name: row.name,
      isFacilitator: row.facilitatorUserId !== null,
    })),
  };
}

export async function setActiveWorkspace(
  db: Database,
  userId: string,
  orgId: string,
  isAdmin = false,
): Promise<void> {
  if (!isAdmin) {
    const [membership] = await db
      .select({ orgId: GameOrgMember.orgId })
      .from(GameOrgMember)
      .where(
        and(eq(GameOrgMember.userId, userId), eq(GameOrgMember.orgId, orgId)),
      )
      .limit(1);
    if (!membership) {
      throw new ORPCError("FORBIDDEN", {
        message: "Нет доступа к этой команде",
      });
    }
  }

  await db
    .insert(GameActiveOrganization)
    .values({ userId, orgId })
    .onConflictDoUpdate({
      target: GameActiveOrganization.userId,
      set: { orgId },
    });
}

/**
 * Org the current user facilitates, or throws — the shared entry check for
 * every `org.*` procedure that exposes group-wide data. Admins pass for
 * whatever workspace they're currently viewing, even without membership.
 */
export async function requireFacilitatorOrgId(
  db: Database,
  userId: string,
  isAdmin = false,
): Promise<string> {
  const orgId = await getFacilitatorOrgId(db, userId, isAdmin);
  if (!orgId) {
    throw new ORPCError("FORBIDDEN", {
      message: "Доступно только ведущим группы",
    });
  }
  return orgId;
}

/**
 * Convenience wrapper around `requireFacilitatorOrgId` for handlers that only
 * have an oRPC `context` on hand — resolves admin status and applies the
 * bypass in one call.
 */
export async function requireFacilitatorOrgIdFromContext(context: {
  db: Database;
  session: { user: { id: string; email: string } };
}): Promise<string> {
  const isAdmin = await resolveIsAdmin(context.db, context.session.user);
  return requireFacilitatorOrgId(context.db, context.session.user.id, isAdmin);
}

/** URL-safe slug from an org name, used as its primary key. */
export function slugifyOrgId(name: string): string {
  const base = name
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll(/[^a-z0-9а-яё]+/gi, "-")
    .replaceAll(/^-+|-+$/g, "");
  return base.length > 0 ? base.slice(0, 48) : `org-${Date.now()}`;
}
