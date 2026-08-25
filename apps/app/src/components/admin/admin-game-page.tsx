import { redirect } from "next/navigation";
import type { BenchmarkRun } from "~/components/admin/admin-benchmark-reports";
import type { AdminGameSection } from "~/components/admin/admin-game-dashboard";
import { AdminGameDashboard } from "~/components/admin/admin-game-dashboard";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

const SECTION_TITLES: Record<AdminGameSection, string> = {
  overview: "Обзор",
  sessions: "Сессии",
  dialogs: "Диалоги",
  employees: "Сотрудники",
  characters: "Лаборатория персонажей",
  tasks: "Задания",
  variants: "Варианты ИИ",
  benchmarks: "Отчёты о качестве",
  reviews: "Ревью старого проекта",
  comparisons: "Сравнение с новым проектом",
  users: "Пользователи",
  settings: "Настройки",
};

export async function AdminGamePage({
  section,
}: {
  section: AdminGameSection;
}) {
  let system: Awaited<ReturnType<typeof api.admin.game.system.overview>>;
  try {
    system = await api.admin.game.system.overview();
  } catch {
    redirect("/game");
  }

  if (!(section in SECTION_TITLES)) redirect("/admin/game/overview");

  const [
    analytics,
    productAnalytics,
    dialogs,
    variants,
    catalog,
    sessions,
    users,
    benchmarks,
    reviews,
    comparisons,
  ] = await Promise.all([
    api.admin.game.analytics({ limit: 5000 }),
    api.admin.game.productAnalytics({ limit: 10000 }),
    api.admin.game.dialogs({ limit: 100, offset: 0 }),
    api.admin.game.variants.list(),
    api.admin.game.catalog.list(),
    api.admin.game.sessions.list({ limit: 100, offset: 0 }),
    api.admin.users.list({ limit: 100, offset: 0 }),
    api.admin.game.benchmarks.list({ limit: 20 }),
    api.admin.game.reviews.list({ limit: 20 }),
    api.admin.game.comparisons.list({ limit: 20 }),
  ]);

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Администрирование", href: "/admin/game/overview" },
          { label: SECTION_TITLES[section] },
        ]}
      />
      <AdminGameDashboard
        section={section}
        initialData={{
          analytics,
          productAnalytics,
          dialogs,
          variants,
          catalog,
          sessions,
          system,
          users,
          benchmarks: benchmarks as unknown as BenchmarkRun[],
          reviews,
          comparisons,
        }}
      />
    </>
  );
}
