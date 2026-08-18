import type { Metadata } from "next";
import { AiDocsOverview } from "~/components/docs/ai-docs-overview";
import { SiteHeader } from "~/components/layout";

export const metadata: Metadata = {
  title: "Технологии ИИ",
  description:
    "Понятный обзор шести LLM-технологий, внедрённых для повышения и измерения качества тренажёра.",
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
