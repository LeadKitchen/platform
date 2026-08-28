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
  Progress,
} from "@acme/ui";
import {
  IconArrowRight,
  IconCheck,
  IconChefHat,
  IconClock,
  IconMessages,
  IconPlayerPlay,
  IconSchool,
  IconTarget,
  IconTrendingUp,
  IconVideo,
} from "@tabler/icons-react";
import Link from "next/link";
import {
  CreateSessionForm,
  KitchenPatternBackdrop,
  PracticeOverview,
  TicketIllustration,
} from "~/components/game";
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
  const [sessions, catalog, playerProgress, assignments] = await Promise.all([
    api.game.session.list({ limit: 20, offset: 0 }),
    api.game.catalog.variants(),
    api.game.activity.progress(),
    api.game.training.listMine(),
  ]);
  const activeSession = sessions.find((session) => session.status === "active");
  const completedCount = sessions.filter((session) =>
    ["completed", "finished"].includes(session.status),
  ).length;
  const focus = playerProgress.criteria[0];
  const assignedTraining = assignments.find(
    (item) => item.status === "assigned",
  );
  const inProgressTraining = assignments.find(
    (item) => item.status === "in_progress",
  );
  const inProgressSession = inProgressTraining
    ? sessions.find(
        (session) => session.trainingAssignmentId === inProgressTraining.id,
      )
    : undefined;
  const latestDialogId = playerProgress.recent[0]?.dialogId;
  const onboardingSteps = [
    {
      title: "Разберитесь с подходами",
      description: "Пройдите короткую разминку по стилям руководства.",
      href: "/game/round-1",
      complete: playerProgress.onboarding.warmupCompleted,
    },
    {
      title: "Откройте первую смену",
      description: "Выберите команду и ситуацию для практики.",
      href: "#start-practice",
      complete: sessions.length > 0,
    },
    {
      title: "Проведите разговор",
      description: "Поставьте задачу сотруднику голосом или текстом.",
      href: activeSession ? `/game/${activeSession.id}` : "#start-practice",
      complete: playerProgress.dialogs > 0,
    },
    {
      title: "Посмотрите разбор",
      description: "Зафиксируйте следующий фокус для новой попытки.",
      href: latestDialogId ? `/game/dialog/${latestDialogId}/report` : "/game",
      complete: playerProgress.onboarding.evaluationViewed,
    },
  ];
  const completedOnboardingSteps = onboardingSteps.filter(
    (step) => step.complete,
  ).length;

  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <Card className="from-accent/60 via-card to-card relative overflow-hidden bg-gradient-to-br">
          <KitchenPatternBackdrop className="text-primary pointer-events-none absolute inset-0 size-full opacity-[0.16]" />
          <CardHeader className="relative">
            <Badge variant="accent" className="w-fit">
              01 · Практика руководителя
            </Badge>
            <CardTitle className="max-w-3xl text-2xl leading-tight sm:text-3xl">
              Превращайте каждый разговор в следующую сильную попытку
            </CardTitle>
            <CardDescription className="max-w-2xl text-base">
              Выберите ситуацию, проведите разговор голосом или текстом и
              получите разбор по конкретным управленческим действиям.
            </CardDescription>
            {activeSession ? (
              <CardAction>
                <Badge>Смена уже идёт</Badge>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="relative flex flex-wrap gap-3">
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

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge variant="accent" className="w-fit">
                  Маршрут старта
                </Badge>
                <CardTitle className="mt-3">
                  Ваша первая сильная смена
                </CardTitle>
                <CardDescription>
                  Четыре коротких шага превращают попытку в управленческий
                  навык.
                </CardDescription>
              </div>
              <Badge variant="secondary">
                {completedOnboardingSteps} из {onboardingSteps.length}
              </Badge>
            </div>
            <Progress
              value={(completedOnboardingSteps / onboardingSteps.length) * 100}
            />
          </CardHeader>
          <CardContent className="grid gap-2 lg:grid-cols-2">
            {onboardingSteps.map((step, index) => (
              <div
                key={step.title}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Badge variant={step.complete ? "success" : "outline"}>
                    {step.complete ? <IconCheck /> : `0${index + 1}`}
                  </Badge>
                  <div className="min-w-0">
                    <p className="font-medium">{step.title}</p>
                    <p className="text-muted-foreground text-sm">
                      {step.description}
                    </p>
                  </div>
                </div>
                {step.complete ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link href={step.href} />}
                    nativeButton={false}
                  >
                    Открыть
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <PracticeOverview
          dialogs={playerProgress.dialogs}
          averageScore={playerProgress.averageScore}
          improvement={playerProgress.improvement}
          activeDays={playerProgress.activeDays}
          styleMatchRate={playerProgress.styleMatchRate}
          dailyActivity={playerProgress.dailyActivity}
          scoreTrend={playerProgress.scoreTrend}
          criteria={playerProgress.criteria}
        />

        {assignedTraining ? (
          <Card>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                Назначенная практика
              </Badge>
              <CardTitle className="flex items-center gap-2">
                <IconTarget /> Закрепите навык: {assignedTraining.criterionTitle}
              </CardTitle>
              <CardDescription>
                Ведущий выделил этот критерий как следующий фокус. Создайте
                сессию ниже — она будет отмечена как выполненная после
                завершения.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                render={<a href="#start-practice" />}
                nativeButton={false}
              >
                Начать назначенную практику
                <IconArrowRight data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {inProgressTraining ? (
          <Card>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                Назначенная практика
              </Badge>
              <CardTitle className="flex items-center gap-2">
                <IconTarget /> Продолжите: {inProgressTraining.criterionTitle}
              </CardTitle>
              <CardDescription>
                Смена по этому назначению уже идёт. Завершите её, чтобы
                отметить практику выполненной.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              {inProgressSession ? (
                <Button
                  render={<Link href={`/game/${inProgressSession.id}`} />}
                  nativeButton={false}
                >
                  Продолжить смену
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              ) : null}
            </CardFooter>
          </Card>
        ) : null}

        {playerProgress.dialogs > 0 ? (
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
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
                  <p className="text-muted-foreground text-sm">
                    Средняя оценка
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {playerProgress.averageScore}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">
                    Последняя серия
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {playerProgress.recentScore}%
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Badge variant="accent" className="w-fit">
                  Рекомендация
                </Badge>
                <CardTitle className="flex items-center gap-2">
                  <IconTarget /> Следующая практика
                </CardTitle>
                <CardDescription>
                  {focus
                    ? `Сфокусируйтесь на критерии «${focus.title}»: он выполнен в ${Math.round(focus.rate * 100)}% подходящих диалогов.`
                    : "Выберите новую ситуацию и закрепите управленческий приём на практике."}
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  render={<a href="#start-practice" />}
                  nativeButton={false}
                >
                  Начать следующую попытку
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          </div>
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
                assignment: assignedTraining
                  ? {
                      id: assignedTraining.id,
                      criterionTitle: assignedTraining.criterionTitle,
                    }
                  : undefined,
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
              <div className="text-muted-foreground flex flex-col items-center gap-3 p-6 text-center text-sm">
                <TicketIllustration className="size-12" />
                Сессий пока нет — создайте первую.
              </div>
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
