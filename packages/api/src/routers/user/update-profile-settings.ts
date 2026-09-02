import { eq, user } from "@acme/db";
import { accountFormSchema, profileFormSchema } from "@acme/validators";

import { protectedProcedure } from "../../orpc";

const updateProfileSettingsSchema = profileFormSchema.extend({
  name: accountFormSchema.shape.name,
  language: accountFormSchema.shape.language,
});

/** Update all fields from the profile settings form atomically. */
export const updateProfileSettings = protectedProcedure
  .input(updateProfileSettingsSchema)
  .handler(async ({ context, input }) => {
    await context.db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({
          name: input.name,
          language: input.language,
          username: input.username,
          email: input.email,
          bio: input.bio,
          updatedAt: new Date(),
        })
        .where(eq(user.id, context.session.user.id));
    });

    return { success: true };
  });
