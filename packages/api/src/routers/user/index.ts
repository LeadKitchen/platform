import { me } from "./me";
import { updateAccount } from "./update-account";
import { updateNotificationPreferences } from "./update-notification-preferences";
import { updateProfile } from "./update-profile";
import { updateProfileSettings } from "./update-profile-settings";

export const userRouter = {
  me,
  updateProfile,
  updateProfileSettings,
  updateAccount,
  updateNotificationPreferences,
};
