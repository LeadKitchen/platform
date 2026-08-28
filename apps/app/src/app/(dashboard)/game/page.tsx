import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Progress,
} from "@acme/ui";
import {
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconChefHat,
  IconClock,
  IconListCheck,
  IconPlayerPlay,
  IconSchool,
  IconTarget,
  IconVideo,
} from "@tabler/icons-react";
import Link from "next/link";
import {
  CreateSessionForm,
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
  const assignedTraining = assignments.find(
    (item) => item.status === "assigned",
  );
  const inProgressTraining = assignments.find(
    (item) => item.status === "in_progress",
  );
  const inProgressSession = inProgressTraining
    ? await api.game.session.byAssignment({
        assignmentId: inProgressTraining.id,
      })
    : undefined;
  const latestDialogId = playerProgress.recent[0]?.dialogId;
  const onboardingSteps = [
    {
      title: "Разберитесь с подходами",
      description:
        "Пройдите короткую разминку и научитесь выбирать стиль руководства под конкретную ситуацию.",
      href: "/game/round-1",
      action: "Пройти разминку",
      complete: playerProgress.onboarding.warmupCompleted,
      benefits: ["4 ситуации", "Без ИИ", "Около 5 минут"],
    },
    {
      title: "Откройте первую смену",
      description:
        "Выберите команду и ситуацию — остальные настройки тренажёр подберёт автоматически.",
      href: "#start-practice",
      action: "Создать смену",
      complete: sessions.length > 0,
      benefits: ["2 простых поля", "Готовый сценарий", "Быстрый старт"],
    },
    {
      title: "Проведите управленческий разговор",
      description:
        "Поставьте задачу сотруднику голосом или текстом и отработайте реакцию на возражения.",
      href: activeSession ? `/game/${activeSession.id}` : "#start-practice",
      action: activeSession ? "Продолжить разговор" : "Начать разговор",
      complete: playerProgress.dialogs > 0,
      benefits: ["Голос или текст", "Живая реакция", "Безопасная практика"],
    },
    {
      title: "Посмотрите разбор",
      description:
        "Изучите оценку по критериям и зафиксируйте один фокус для следующей попытки.",
      href: latestDialogId
        ? `/game/dialog/${latestDialogId}/report`
        : "#start-practice",
      action: latestDialogId ? "Открыть разбор" : "Начать практику",
      complete: playerProgress.onboarding.evaluationViewed,
      benefits: ["Оценка действий", "Точки роста", "Следующий фокус"],
    },
  ];
  const completedOnboardingSteps = onboardingSteps.filter(
    (step) => step.complete,
  ).length;
  const currentStepIndex = Math.max(
    0,
    onboardingSteps.findIndex((step) => !step.complete),
  );

  return (
    <>
      <SiteHeader title="Обзор" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CardTitle className="flex items-center gap-2">
                <IconListCheck className="size-4" />
                Стартовый маршрут
              </CardTitle>
              <span className="text-muted-foreground text-xs">
                Займёт около 15 минут
              </span>
            </div>
            <div className="flex items-center gap-3 sm:justify-end">
              <span className="text-muted-foreground text-xs tabular-nums">
                {completedOnboardingSteps} из {onboardingSteps.length} выполнено
              </span>
              <Badge variant="outline">
                {Math.round(
                  (completedOnboardingSteps / onboardingSteps.length) * 100,
                )}
                %
              </Badge>
            </div>
          </CardHeader>
          <Progress
            value={(completedOnboardingSteps / onboardingSteps.length) * 100}
            className="h-1 rounded-none border-0"
          />
          <CardContent className="px-3 sm:px-6">
            <Accordion defaultValue={[`step-${currentStepIndex}`]}>
              {onboardingSteps.map((step, index) => (
                <AccordionItem
                  key={step.title}
                  value={`step-${index}`}
                  className="last:border-b-0"
                >
                  <AccordionTrigger className="gap-3 px-2 hover:no-underline">
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                        step.complete
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {step.complete ? <IconCheck className="size-3" /> : null}
                    </span>
                    <span
                      className={
                        step.complete
                          ? "text-muted-foreground line-through"
                          : undefined
                      }
                    >
                      {step.title}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pl-10 pr-8">
                    <p className="text-muted-foreground max-w-3xl leading-6">
                      {step.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                      {step.benefits.map((benefit) => (
                        <span
                          key={benefit}
                          className="text-muted-foreground flex items-center gap-1.5 text-xs"
                        >
                          <IconCheck className="text-primary size-3.5" />
                          {benefit}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {step.complete ? (
                        <Badge variant="secondary">Шаг выполнен</Badge>
                      ) : (
                        <Button
                          size="sm"
                          render={<Link href={step.href} />}
                          nativeButton={false}
                        >
                          {step.action}
                          <IconArrowRight data-icon="inline-end" />
                        </Button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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

        {assignedTraining || inProgressTraining ? (
          <Card className="gap-4">
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                Назначенная практика
              </Badge>
              <CardTitle className="flex items-center gap-2">
                <IconTarget className="size-5" />
                {inProgressTraining
                  ? `Продолжите: ${inProgressTraining.criterionTitle}`
                  : `Закрепите навык: ${assignedTraining?.criterionTitle}`}
              </CardTitle>
              <CardDescription>
                Ведущий команды выделил этот критерий как следующий фокус.
              </CardDescription>
            </CardHeader>
            {inProgressSession || (!inProgressTraining && assignedTraining) ? (
              <CardFooter>
                <Button
                  render={
                    <Link
                      href={
                        inProgressSession
                          ? `/game/${inProgressSession.id}`
                          : "#start-practice"
                      }
                    />
                  }
                  nativeButton={false}
                >
                  {inProgressSession ? "Продолжить смену" : "Начать практику"}
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              </CardFooter>
            ) : null}
          </Card>
        ) : null}

        <section className="grid items-start gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-5">
              <div>
                <p className="text-muted-foreground text-xs font-medium">
                  История
                </p>
                <CardTitle className="mt-1">Ваши смены</CardTitle>
                <CardDescription className="mt-1">
                  Продолжайте активные тренировки или возвращайтесь к разбору.
                </CardDescription>
              </div>
              {sessions.length > 0 ? (
                <Badge variant="outline">{completedCount} завершено</Badge>
              ) : null}
            </CardHeader>
            <CardContent className="p-3">
              {sessions.length === 0 ? (
                <div className="text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
                  <TicketIllustration className="size-12" />
                  <div>
                    <p className="text-foreground font-medium">Смен пока нет</p>
                    <p className="mt-1">Создайте первую практику справа.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  {sessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/game/${session.id}`}
                      className="hover:bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full">
                          {session.status === "active" ? (
                            <IconPlayerPlay className="size-4" />
                          ) : (
                            <IconCheck className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {session.title}
                          </span>
                          <span className="text-muted-foreground flex items-center gap-1 text-xs">
                            <IconClock className="size-3.5" /> Раунд{" "}
                            {session.round}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge
                          variant={
                            SESSION_STATUS_VARIANTS[session.status] ?? "outline"
                          }
                        >
                          {SESSION_STATUS_LABELS[session.status] ??
                            session.status}
                        </Badge>
                        <IconArrowRight className="text-muted-foreground size-4" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="start-practice">
            <CardHeader>
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                <IconChefHat className="size-5" />
              </span>
              <CardTitle>Новая смена</CardTitle>
              <CardDescription>
                Выберите ситуацию и сразу переходите к управленческому
                разговору.
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
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="gap-4">
            <CardHeader>
              <IconSchool className="text-primary size-5" />
              <CardTitle className="text-base">Освежить теорию</CardTitle>
              <CardDescription>
                Четыре ситуации по стилям руководства — около пяти минут.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/game/round-1" />}
                nativeButton={false}
              >
                Открыть разминку
              </Button>
            </CardFooter>
          </Card>
          <Card className="gap-4">
            <CardHeader>
              <IconVideo className="text-primary size-5" />
              <CardTitle className="text-base">Посмотреть пример</CardTitle>
              <CardDescription>
                Демо показывает весь путь: от выбора смены до итогового разбора.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/game/demo" />}
                nativeButton={false}
              >
                Смотреть демо
              </Button>
            </CardFooter>
          </Card>
          <Card className="gap-4">
            <CardHeader>
              <IconCalendar className="text-primary size-5" />
              <CardTitle className="text-base">Регулярность важнее</CardTitle>
              <CardDescription>
                Короткая практика несколько раз в неделю быстрее закрепляет
                навык.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                render={<a href="#start-practice" />}
                nativeButton={false}
              >
                Запланировать попытку
              </Button>
            </CardFooter>
          </Card>
        </section>
      </main>
    </>
  );
}
