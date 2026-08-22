import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import {
  IconArrowRight,
  IconCheck,
  IconChefHat,
  IconClock,
  IconMessages,
  IconPlayerPlay,
  IconSchool,
  IconTrendingUp,
  IconVideo,
} from "@tabler/icons-react";
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

const SESSION_STATUS_VARIANTS: Record<
  string,
  "accent" | "secondary" | "outline"
> = {
  active: "accent",
  completed: "secondary",
  finished: "secondary",
  archived: "outline",
};

export default async function GamePage() {
  const [sessions, catalog, playerProgress] = await Promise.all([
    api.game.session.list({ limit: 20, offset: 0 }),
    api.game.catalog.variants(),
    api.game.activity.progress(),
  ]);
  const activeSession = sessions.find((session) => session.status === "active");
  const completedCount = sessions.filter((session) =>
    ["completed", "finished"].includes(session.status),
  ).length;

  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <Card className="from-accent/60 via-card to-card overflow-hidden bg-gradient-to-br">
          <CardHeader>
            <Badge variant="accent" className="w-fit">
              Тренажёр руководителя
            </Badge>
            <CardTitle className="max-w-3xl text-2xl leading-tight sm:text-3xl">
              Проведите смену так, чтобы команда поняла задачу и сохранила
              мотивацию
            </CardTitle>
            <CardDescription className="max-w-2xl text-base">
              Выберите ситуацию, поговорите с сотрудником голосом или текстом и
              получите разбор конкретных управленческих действий.
            </CardDescription>
            {activeSession ? (
              <CardAction>
                <Badge>Смена уже идёт</Badge>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {activeSession ? (
              <Button
                size="lg"
                render={<Link href={`/game/${activeSession.id}`} />}
                nativeButton={false}
              >
                <IconPlayerPlay data-icon="inline-start" />
                Продолжить «{activeSession.title}»
              </Button>
            ) : (
              <Button
                size="lg"
                render={<a href="#start-practice" />}
                nativeButton={false}
              >
                <IconPlayerPlay data-icon="inline-start" />
                Начать практику
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/game/round-1" />}
              nativeButton={false}
            >
              Сначала потренироваться на примерах
            </Button>
            <Button
              size="lg"
              variant="ghost"
              render={<Link href="/game/demo" />}
              nativeButton={false}
            >
              <IconVideo data-icon="inline-start" />
              Посмотреть демо
            </Button>
          </CardContent>
        </Card>

        {playerProgress.dialogs > 0 ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <IconTrendingUp /> Ваш прогресс
                  </CardTitle>
                  <CardDescription>
                    Результаты последних управленческих разговоров.
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {playerProgress.improvement >= 0 ? "+" : ""}
                  {playerProgress.improvement} п.п. к первым попыткам
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-sm">Разговоров</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {playerProgress.dialogs}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Средняя оценка</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {playerProgress.averageScore}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Следующий фокус</p>
                <p className="font-medium">
                  {playerProgress.criteria[0]?.title ?? "Новая ситуация"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline">Шаг 1</Badge>
                <IconSchool />
              </div>
              <CardTitle>Разберитесь в стилях</CardTitle>
              <CardDescription>
                4 коротких ситуации без ИИ · около 5 минут
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                variant="outline"
                render={<Link href="/game/round-1" />}
                nativeButton={false}
              >
                Пройти разминку
                <IconArrowRight data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline">Шаг 2</Badge>
                <IconMessages />
              </div>
              <CardTitle>Поставьте задачу</CardTitle>
              <CardDescription>
                Выберите сотрудника и проведите живой разговор с ИИ
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline">Шаг 3</Badge>
                <IconCheck />
              </div>
              <CardTitle>Получите разбор</CardTitle>
              <CardDescription>
                Увидите, что сработало и что попробовать в следующей смене
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card id="start-practice">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconChefHat />
              Новая смена
            </CardTitle>
            <CardDescription>
              Два простых поля — и можно начинать. Технические настройки
              тренажёра система выберет сама.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateSessionForm
              defaults={{
                defaultVariantId: catalog.settings.defaultVariantId,
                defaultRound: catalog.settings.defaultRound,
                allowRoundThree: catalog.settings.allowRoundThree,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Ваши смены</CardTitle>
                <CardDescription>
                  Возвращайтесь к незавершённым или пересматривайте результаты.
                </CardDescription>
              </div>
              {sessions.length > 0 ? (
                <Badge variant="secondary">{completedCount} завершено</Badge>
              ) : null}
            </div>
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
                <span>
                  <span className="block font-medium">{session.title}</span>
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <IconClock /> Раунд {session.round}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      SESSION_STATUS_VARIANTS[session.status] ?? "outline"
                    }
                  >
                    {SESSION_STATUS_LABELS[session.status] ?? session.status}
                  </Badge>
                  <IconArrowRight />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
