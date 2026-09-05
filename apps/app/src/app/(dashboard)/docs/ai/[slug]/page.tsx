import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AiTechnologyDetail } from "~/components/docs/ai-technology-detail";
import { SiteHeader } from "~/components/layout";
import {
  AI_TECHNOLOGIES,
  AI_TECHNOLOGY_BY_SLUG,
} from "~/content/ai-technologies";
import { api } from "~/orpc/server";

interface AiTechnologyPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return AI_TECHNOLOGIES.map((technology) => ({
    slug: technology.slug,
  }));
}

export async function generateMetadata({
  params,
}: AiTechnologyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const technology = AI_TECHNOLOGY_BY_SLUG.get(slug);

  if (!technology) {
    return {
      title: "Технология не найдена",
    };
  }

  return {
    title: `${technology.shortName} — технологии ИИ`,
    description: technology.summary,
  };
}

export default async function AiTechnologyPage({
  params,
}: AiTechnologyPageProps) {
  try {
    await api.admin.game.system.overview();
  } catch {
    redirect("/game");
  }

  const { slug } = await params;
  const technology = AI_TECHNOLOGY_BY_SLUG.get(slug);

  if (!technology) {
    notFound();
  }

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Технологии ИИ", href: "/docs/ai" },
          { label: technology.shortName },
        ]}
      />
      <AiTechnologyDetail technology={technology} />
    </>
  );
}
