import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import { ProfileForm } from "~/components/settings/profile-form";
import { SettingsPageShell } from "~/components/settings/settings-page-shell";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function SettingsProfilePage() {
  const user = await api.user.me();

  return (
    <SettingsPageShell>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>Личная информация</CardTitle>
          <CardDescription>
            Обновите фото, контактные данные и описание профиля.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <ProfileForm
            initialData={{
              username: user?.username || "",
              email: user?.email || "",
              bio: user?.bio || "",
            }}
          />
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
