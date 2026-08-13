import { AppAdmin, desc, eq, user } from "@acme/db";
import { z } from "zod";

import { adminProcedure } from "../../../orpc";

/**
 * List all registered users with pagination.
 *
 * @example client.admin.users.list({ limit: 20, offset: 0 })
 */
export const list = adminProcedure
  .input(
    z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(async ({ context, input }) => {
    const bootstrapEmails = new Set(
      (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    const rows = await context.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerified,
        language: user.language,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        adminUserId: AppAdmin.userId,
        adminRole: AppAdmin.role,
      })
      .from(user)
      .leftJoin(AppAdmin, eq(AppAdmin.userId, user.id))
      .orderBy(desc(user.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    return rows.map(({ adminUserId, adminRole, ...row }) => ({
      ...row,
      isBootstrapAdmin: bootstrapEmails.has(row.email.toLowerCase()),
      isAdmin:
        adminUserId !== null || bootstrapEmails.has(row.email.toLowerCase()),
      role: bootstrapEmails.has(row.email.toLowerCase())
        ? ("admin" as const)
        : ((adminRole ?? "facilitator") as
            | "admin"
            | "methodologist"
            | "facilitator"),
    }));
  });
