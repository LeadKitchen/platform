import { ORPCError } from "@orpc/server";
import { notFound, redirect } from "next/navigation";
import { CoachingPathDetail } from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function CoachingPathPage({
  params,
}: {
  params: Promise<{ pathId: string }>;
}) {
  const mine = await api.org.mine();
  if (!mine.isFacilitator) redirect("/game/coaching-paths");
  const { pathId } = await params;
  const [data, members] = await Promise.all([
    api.org.coachingPaths.byId({ id: pathId }).catch((cause) => {
      if (cause instanceof ORPCError && cause.code === "NOT_FOUND") return null;
      throw cause;
    }),
    api.org.coachingPaths.members(),
  ]);
  if (!data) notFound();
  return (
    <>
      <SiteHeader
        title={data.path.name}
        breadcrumbs={[
          { label: "Деловая игра", href: "/game" },
          { label: "Coaching Paths", href: "/game/coaching-paths" },
          { label: data.path.name },
        ]}
      />
      <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
        <CoachingPathDetail
          path={data.path}
          assignments={data.assignments}
          members={members}
        />
      </main>
    </>
  );
}
