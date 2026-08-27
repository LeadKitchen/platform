import { type Database, eq, GameFacilitator, GameOrgMember } from "@acme/db";
import { ORPCError } from "@orpc/server";

/** Org a user belongs to as a participant, or `null` outside any org. */
export async function getMemberOrgId(
  db: Database,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ orgId: GameOrgMember.orgId })
    .from(GameOrgMember)
    .where(eq(GameOrgMember.userId, userId))
    .limit(1);
  return row?.orgId ?? null;
}

/** Org a user facilitates, or `null` if they hold no facilitator grant. */
export async function getFacilitatorOrgId(
  db: Database,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ orgId: GameFacilitator.orgId })
    .from(GameFacilitator)
    .where(eq(GameFacilitator.userId, userId))
    .limit(1);
  return row?.orgId ?? null;
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
