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

/** Active workspace a user plays under, or `null` outside any workspace. */
export async function getMemberOrgId(
  db: Database,
  userId: string,
): Promise<string | null> {
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

/** Whether the active workspace is one the user facilitates. */
export async function getFacilitatorOrgId(
  db: Database,
  userId: string,
): Promise<string | null> {
  const orgId = await getMemberOrgId(db, userId);
  if (!orgId) return null;

  const [row] = await db
    .select({ orgId: GameFacilitator.orgId })
    .from(GameFacilitator)
    .where(
      and(eq(GameFacilitator.userId, userId), eq(GameFacilitator.orgId, orgId)),
    )
    .limit(1);
  return row?.orgId ?? null;
}

export async function listWorkspaces(db: Database, userId: string) {
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
): Promise<void> {
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
 * every `org.*` procedure that exposes group-wide data.
 */
export async function requireFacilitatorOrgId(
  db: Database,
  userId: string,
): Promise<string> {
  const orgId = await getFacilitatorOrgId(db, userId);
  if (!orgId) {
    throw new ORPCError("FORBIDDEN", {
      message: "Доступно только ведущим группы",
    });
  }
  return orgId;
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
