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

  const role = system.runtime.adminRole;
  const allowedSections = new Set<AdminGameSection>(
    role === "admin"
      ? (Object.keys(SECTION_TITLES) as AdminGameSection[])
      : role === "methodologist"
        ? [
            "overview",
            "sessions",
            "dialogs",
            "employees",
            "characters",
            "tasks",
            "variants",
            "benchmarks",
            "settings",
          ]
        : ["overview", "sessions", "dialogs"],
  );
  if (!allowedSections.has(section)) redirect("/admin/game/overview");

  const [
    analytics,
    productAnalytics,
    dialogs,
    variants,
    catalog,
    sessions,
    users,
    benchmarks,
  ] = await Promise.all([
    api.admin.game.analytics({ limit: 5000 }),
    api.admin.game.productAnalytics({ limit: 10000 }),
    api.admin.game.dialogs({ limit: 100, offset: 0 }),
    api.admin.game.variants.list(),
    api.admin.game.catalog.list(),
    api.admin.game.sessions.list({ limit: 100, offset: 0 }),
    role === "admin"
      ? api.admin.users.list({ limit: 100, offset: 0 })
      : Promise.resolve([]),
    allowedSections.has("benchmarks")
      ? api.admin.game.benchmarks.list({ limit: 20 })
      : Promise.resolve([]),
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
        }}
      />
    </>
  );
}
