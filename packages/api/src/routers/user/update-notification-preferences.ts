import { eq, sql, user } from "@acme/db";
import { updateNotificationPreferencesSchema } from "@acme/validators";

import { protectedProcedure } from "../../orpc";

/**
 * Merge a partial set of notification preferences into the user's stored
 * overrides. Missing keys are left untouched (and fall back to
 * `defaultNotificationPreferences` at read time).
 */
export const updateNotificationPreferences = protectedProcedure
  .input(updateNotificationPreferencesSchema)
  .handler(async ({ context, input }) => {
    await context.db
      .update(user)
      .set({
        notificationPreferences: sql`${user.notificationPreferences} || ${JSON.stringify(input)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(user.id, context.session.user.id));

    return { success: true };
  });
