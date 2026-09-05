import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AiDocsOverview } from "~/components/docs/ai-docs-overview";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const metadata: Metadata = {
  title: "Технологии ИИ",
  description:
    "Шесть LLM-технологий конвейера: продуктовое объяснение, технический разбор реализации и отчёты офлайн-стенда против классических подходов.",
};

export default async function AiDocsPage() {
  try {
    await api.admin.game.system.overview();
  } catch {
    redirect("/game");
  }

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: "Технологии ИИ" },
        ]}
      />
      <AiDocsOverview />
    </>
  );
}
