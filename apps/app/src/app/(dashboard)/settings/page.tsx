import { defaultNotificationPreferences } from "@acme/validators";
import { AccountTabs } from "~/components/settings/account-tabs";
import { SettingsPageShell } from "~/components/settings/settings-page-shell";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await api.user.me();

  return (
    <SettingsPageShell>
      <AccountTabs
        profile={{
          name: user?.name || "",
          username: user?.username || "",
          email: user?.email || "",
          bio: user?.bio || "",
          language: user?.language || "ru",
        }}
        notificationPreferences={{
          ...defaultNotificationPreferences,
          ...(user?.notificationPreferences ?? {}),
        }}
      />
    </SettingsPageShell>
  );
}
