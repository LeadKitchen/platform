import { redirect } from "next/navigation";
import { AdminGameDashboard } from "~/components/admin/admin-game-dashboard";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function AdminGamePage() {
  let system: Awaited<ReturnType<typeof api.admin.game.system.overview>>;
  try {
    system = await api.admin.game.system.overview();
  } catch {
    redirect("/game");
  }

  const [analytics, dialogs, variants, catalog, sessions, users] =
    await Promise.all([
      api.admin.game.analytics({ limit: 5000 }),
      api.admin.game.dialogs({ limit: 100, offset: 0 }),
      api.admin.game.variants.list(),
      api.admin.game.catalog.list(),
      api.admin.game.sessions.list({ limit: 100, offset: 0 }),
      api.admin.users.list({ limit: 100, offset: 0 }),
    ]);

  return (
    <>
      <SiteHeader title="Администрирование игры" />
      <AdminGameDashboard
        initialData={{
          analytics,
          dialogs,
          variants,
          catalog,
          sessions,
          system,
          users,
        }}
      />
    </>
  );
}
