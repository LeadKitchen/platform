import { AppAdmin, eq, user } from "@acme/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

/** Grant or revoke persistent admin access for a registered user. */
export const setAdmin = adminProcedure
  .input(z.object({ userId: z.string().min(1), isAdmin: z.boolean() }))
  .handler(async ({ context, input }) => {
    const [target] = await context.db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);

    if (!target) {
      throw new ORPCError("NOT_FOUND", { message: "Пользователь не найден" });
    }

    const bootstrapEmails = new Set(
      (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!input.isAdmin && bootstrapEmails.has(target.email.toLowerCase())) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Bootstrap-администратор задаётся через ADMIN_EMAILS",
      });
    }
    if (!input.isAdmin && target.id === context.session.user.id) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Нельзя отозвать собственный доступ администратора",
      });
    }

    if (input.isAdmin) {
      await context.db
        .insert(AppAdmin)
        .values({ userId: target.id, grantedBy: context.session.user.id })
        .onConflictDoNothing();
    } else {
      await context.db.delete(AppAdmin).where(eq(AppAdmin.userId, target.id));
    }

    return { userId: target.id, isAdmin: input.isAdmin };
  });
