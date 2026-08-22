import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDocsOverview } from "~/components/admin/admin-docs-overview";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const metadata: Metadata = {
  title: "Документация по продукту",
  description:
    "Полная документация: игровой процесс, административная панель, роли и доступы, ИИ-технологии и контроль качества.",
};

export default async function AdminDocsPage() {
  try {
    await api.admin.game.system.overview();
  } catch {
    redirect("/game");
  }

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Администрирование", href: "/admin/game/overview" },
          { label: "Документация" },
        ]}
      />
      <AdminDocsOverview />
    </>
  );
}
