import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import { AccountForm } from "~/components/settings/account-form";
import { AppearanceSettings } from "~/components/settings/appearance-settings";
import { SettingsPageShell } from "~/components/settings/settings-page-shell";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function SettingsAccountPage() {
  const user = await api.user.me();

  return (
    <SettingsPageShell>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>Предпочтения аккаунта</CardTitle>
          <CardDescription>
            Обновите отображаемое имя и язык интерфейса.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <AccountForm
            initialData={{
              name: user?.name || "",
              language: user?.language || "ru",
            }}
          />
        </CardContent>
      </Card>
      <AppearanceSettings />
    </SettingsPageShell>
  );
}
