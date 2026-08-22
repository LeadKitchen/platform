import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDocsDetail } from "~/components/admin/admin-docs-detail";
import { SiteHeader } from "~/components/layout";
import {
  ADMIN_DOC_SECTION_BY_SLUG,
  ADMIN_DOC_SECTIONS,
} from "~/content/admin-docs";

interface AdminDocsSectionPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return ADMIN_DOC_SECTIONS.map((section) => ({
    slug: section.slug,
  }));
}

export async function generateMetadata({
  params,
}: AdminDocsSectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const section = ADMIN_DOC_SECTION_BY_SLUG.get(slug);

  if (!section) {
    return { title: "Раздел не найден" };
  }

  return {
    title: `${section.shortTitle} — документация`,
    description: section.summary,
  };
}

export default async function AdminDocsSectionPage({
  params,
}: AdminDocsSectionPageProps) {
  const { slug } = await params;
  const section = ADMIN_DOC_SECTION_BY_SLUG.get(slug);

  if (!section) {
    notFound();
  }

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: "Администрирование", href: "/admin/game/overview" },
          { label: "Документация", href: "/admin/docs" },
          { label: section.shortTitle },
        ]}
      />
      <AdminDocsDetail section={section} />
    </>
  );
}
