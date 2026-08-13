import {
  and,
  type Database,
  eq,
  GameDialog,
  GameOrder,
  GameSession,
} from "@acme/db";
import { ORPCError } from "@orpc/server";

function notFound(kind: string): never {
  throw new ORPCError("NOT_FOUND", { message: `${kind} не найден` });
}

export async function requireOwnedSession(
  db: Database,
  sessionId: string,
  userId: string,
) {
  const [session] = await db
    .select()
    .from(GameSession)
    .where(
      and(eq(GameSession.id, sessionId), eq(GameSession.createdBy, userId)),
    )
    .limit(1);
  return session ?? notFound("Сессия");
}

export async function requireOwnedOrder(
  db: Database,
  orderId: string,
  userId: string,
) {
  const [row] = await db
    .select({ order: GameOrder, session: GameSession })
    .from(GameOrder)
    .innerJoin(GameSession, eq(GameSession.id, GameOrder.sessionId))
    .where(and(eq(GameOrder.id, orderId), eq(GameSession.createdBy, userId)))
    .limit(1);
  return row ?? notFound("Заказ");
}

export async function requireOwnedDialog(
  db: Database,
  dialogId: string,
  userId: string,
) {
  const [row] = await db
    .select({ dialog: GameDialog, session: GameSession })
    .from(GameDialog)
    .innerJoin(GameSession, eq(GameSession.id, GameDialog.sessionId))
    .where(and(eq(GameDialog.id, dialogId), eq(GameSession.createdBy, userId)))
    .limit(1);
  return row ?? notFound("Диалог");
}
