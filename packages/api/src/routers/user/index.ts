import { me } from "./me";
import { updateAccount } from "./update-account";
import { updateNotificationPreferences } from "./update-notification-preferences";
import { updateProfile } from "./update-profile";

export const userRouter = {
  me,
  updateProfile,
  updateAccount,
  updateNotificationPreferences,
};
