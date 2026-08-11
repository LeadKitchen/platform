import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import Link from "next/link";
import { VariantComparison } from "~/components/game";
import { SiteHeader } from "~/components/layout";
import { api } from "~/orpc/server";

export const dynamic = "force-dynamic";

export default async function AdminGamePage() {
  const [analytics, dialogs, variants] = await Promise.all([
    api.admin.game.analytics({ limit: 5000 }),
    api.admin.game.dialogs({ limit: 50, offset: 0 }),
    api.admin.game.variants.list(),
  ]);

  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <VariantComparison variants={analytics.variants} />

        <Card>
          <CardHeader>
            <CardTitle>Варианты конвейера</CardTitle>
            <CardDescription>
              Каждый вариант — это выбор реализации для трёх этапов: сбор
              контекста, поведение персонажа, оценка диалога.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {variants.variants.map((variant) => (
              <div
                key={variant.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div>
                  <p className="font-medium">{variant.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {variant.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">знания: {variant.knowledge}</Badge>
                  <Badge variant="outline">персона: {variant.persona}</Badge>
                  <Badge variant="outline">оценка: {variant.evaluation}</Badge>
                  <Badge variant={variant.isActive ? "default" : "secondary"}>
                    {variant.isActive ? "включён" : "выключен"}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Последние диалоги</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dialogs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Диалогов пока нет.
              </p>
            ) : null}

            {dialogs.map((row) => (
              <Link
                key={row.dialog.id}
                href={`/game/dialog/${row.dialog.id}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.sessionTitle}</span>
                  <span className="text-muted-foreground text-sm">
                    {row.dialog.employeeId} · {row.dialog.taskId}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Раунд {row.dialog.round}</Badge>
                  <Badge variant="secondary">{row.dialog.variantId}</Badge>
                  {row.evaluation ? (
                    <>
                      <Badge>{row.evaluation.scorePercent}%</Badge>
                      <Badge variant="outline">
                        {row.evaluation.expectedStyle} →{" "}
                        {row.evaluation.actualStyle}
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline">без оценки</Badge>
                  )}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
