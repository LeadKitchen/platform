import type { Metadata } from "next";
import { AdminDocsOverview } from "~/components/admin/admin-docs-overview";
import { SiteHeader } from "~/components/layout";

export const metadata: Metadata = {
  title: "Документация по продукту",
  description:
    "Полная документация: игровой процесс, административная панель, роли и доступы, ИИ-технологии и контроль качества.",
};

export default function AdminDocsPage() {
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
