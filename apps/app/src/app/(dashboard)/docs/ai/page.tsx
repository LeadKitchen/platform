import type { Metadata } from "next";
import { AiDocsOverview } from "~/components/docs/ai-docs-overview";
import { SiteHeader } from "~/components/layout";

export const metadata: Metadata = {
  title: "Технологии ИИ",
  description:
    "Шесть LLM-технологий конвейера: продуктовое объяснение, технический разбор реализации и отчёты офлайн-стенда против классических подходов.",
};

export default function AiDocsPage() {
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
