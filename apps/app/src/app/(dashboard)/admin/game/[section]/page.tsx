import { notFound } from "next/navigation";
import type { AdminGameSection } from "~/components/admin/admin-game-dashboard";
import { AdminGamePage } from "~/components/admin/admin-game-page";

export const dynamic = "force-dynamic";

const SECTIONS = new Set<AdminGameSection>([
  "overview",
  "sessions",
  "dialogs",
  "employees",
  "characters",
  "tasks",
  "variants",
  "benchmarks",
  "users",
  "settings",
]);

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!SECTIONS.has(section as AdminGameSection)) notFound();

  return <AdminGamePage section={section as AdminGameSection} />;
}
