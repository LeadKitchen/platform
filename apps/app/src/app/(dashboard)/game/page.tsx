import { Badge, Card, CardContent, CardHeader, CardTitle } from "@acme/ui";
import Link from "next/link";
import { CreateSessionForm } from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

const SESSION_STATUS_LABELS: Record<string, string> = {
  active: "идёт",
  completed: "завершена",
  finished: "завершена",
  archived: "в архиве",
};

export default async function GamePage() {
  const [sessions, catalog] = await Promise.all([
    api.game.session.list({ limit: 20, offset: 0 }),
    api.game.catalog.variants(),
  ]);

  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Новая сессия</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateSessionForm
              defaults={{
                defaultVariantId: catalog.settings.defaultVariantId,
                defaultRound: catalog.settings.defaultRound,
                allowRoundThree: catalog.settings.allowRoundThree,
              }}
              variants={catalog.variants.map((variant) => ({
                id: variant.id,
                name: variant.name,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Сессии</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Сессий пока нет — создайте первую.
              </p>
            ) : null}

            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/game/${session.id}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="font-medium">{session.title}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Раунд {session.round}</Badge>
                  <Badge variant="secondary">
                    {session.variantId ?? "по умолчанию"}
                  </Badge>
                  <Badge variant="outline">
                    {SESSION_STATUS_LABELS[session.status] ?? session.status}
                  </Badge>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
