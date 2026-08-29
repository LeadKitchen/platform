"use client";

import type { RouterOutputs } from "@acme/api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Progress,
  Separator,
  Textarea,
  toast,
} from "@acme/ui";
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconPlayerPlay,
  IconPlus,
  IconRoute,
  IconSearch,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { employeeAvatarUri } from "~/lib/avatar";
import { client } from "~/orpc/react";
import { GameSectionHeader } from "./game-section-header";
import type { RoleplayScenarioView } from "./roleplay-catalog";

export type CoachingPathView =
  RouterOutputs["org"]["coachingPaths"]["list"][number];
export type CoachingPathStepView = CoachingPathView["steps"][number];
export type CoachingAssignmentView =
  RouterOutputs["game"]["coachingPaths"]["listMine"][number];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ScenarioAvatar({
  scenario,
}: {
  scenario: CoachingPathStepView["scenario"];
}) {
  return (
    <Avatar className="size-10 border-2 border-background">
      <AvatarImage
        src={employeeAvatarUri(scenario.employeeName)}
        alt={scenario.employeeName}
      />
      <AvatarFallback>{initials(scenario.employeeName)}</AvatarFallback>
    </Avatar>
  );
}

function PathEditor({
  open,
  path,
  scenarios,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  path: CoachingPathView | null;
  scenarios: RoleplayScenarioView[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(path?.name ?? "");
  const [description, setDescription] = useState(path?.description ?? "");
  const [steps, setSteps] = useState<CoachingPathStepView[]>(path?.steps ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return scenarios;
    return scenarios.filter((scenario) =>
      [scenario.title, scenario.employeeName, scenario.employeeRole]
        .join(" ")
        .toLocaleLowerCase("ru")
        .includes(query),
    );
  }, [scenarios, search]);

  function addScenario(scenario: RoleplayScenarioView) {
    if (steps.length >= 10) return;
    setSteps((current) => [
      ...current,
      { id: crypto.randomUUID(), scenario, minScore: 60 },
    ]);
    setPickerOpen(false);
  }

  function move(index: number, direction: -1 | 1) {
    setSteps((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const sourceStep = next[index];
      const targetStep = next[target];
      if (!sourceStep || !targetStep) return current;
      next[index] = targetStep;
      next[target] = sourceStep;
      return next;
    });
  }

  async function save() {
    if (name.trim().length < 2 || steps.length === 0 || pending) return;
    setPending(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        isActive: true,
        steps: steps.map((step) => ({
          id: step.id,
          scenarioId: step.scenario.id,
          minScore: step.minScore,
        })),
      };
      if (path)
        await client.org.coachingPaths.update({ ...payload, id: path.id });
      else await client.org.coachingPaths.create(payload);
      toast.success(path ? "Путь обновлён" : "Путь создан и активирован");
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось сохранить путь",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {path ? "Редактировать путь" : "Создать путь обучения"}
            </DialogTitle>
            <DialogDescription>
              Соберите до 10 последовательных AI Roleplay-тренировок и задайте
              проходной балл.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="path-name">Название пути</FieldLabel>
              <Input
                id="path-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, Новый руководитель"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="path-description">Описание</FieldLabel>
              <Textarea
                id="path-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Какой навык и для кого развивает этот путь"
              />
            </Field>
          </FieldGroup>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Шаги обучения</p>
              <p className="text-muted-foreground text-sm">
                {steps.length}/10 · следующий шаг откроется после проходного
                балла
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setPickerOpen(true)}
              disabled={steps.length >= 10}
            >
              <IconPlus data-icon="inline-start" />
              Добавить сценарий
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
              >
                <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {index + 1}
                </span>
                <ScenarioAvatar scenario={step.scenario} />
                <div className="min-w-44 flex-1">
                  <p className="truncate text-sm font-medium">
                    {step.scenario.employeeName}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {step.scenario.title}
                  </p>
                </div>
                <Field className="w-28">
                  <FieldLabel htmlFor={`score-${step.id}`}>
                    Мин. балл
                  </FieldLabel>
                  <Input
                    id={`score-${step.id}`}
                    type="number"
                    min={0}
                    max={100}
                    value={step.minScore}
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((item) =>
                          item.id === step.id
                            ? {
                                ...item,
                                minScore: Math.max(
                                  0,
                                  Math.min(100, Number(event.target.value)),
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Поднять шаг"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <IconArrowUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Опустить шаг"
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <IconArrowDown />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Удалить шаг"
                    onClick={() =>
                      setSteps((current) =>
                        current.filter((item) => item.id !== step.id),
                      )
                    }
                  >
                    <IconTrash />
                  </Button>
                </div>
              </div>
            ))}
            {steps.length === 0 ? (
              <button
                type="button"
                className="text-muted-foreground hover:bg-muted flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm transition-colors"
                onClick={() => setPickerOpen(true)}
              >
                <IconPlus className="size-5" />
                Добавьте первый AI Roleplay-сценарий
              </button>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Отмена
            </Button>
            <Button
              onClick={save}
              disabled={pending || name.trim().length < 2 || steps.length === 0}
            >
              {pending ? "Сохраняем…" : "Сохранить и активировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Добавить AI Roleplay</DialogTitle>
            <DialogDescription>
              Выберите персонажа и ситуацию для следующего шага.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <IconSearch className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск сценария"
              className="pl-9"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className="hover:bg-muted flex items-center gap-3 rounded-xl border p-3 text-left transition-colors"
                onClick={() => addScenario(scenario)}
              >
                <ScenarioAvatar scenario={scenario} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {scenario.employeeName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {scenario.title}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CoachingPaths({
  isFacilitator,
  initialPaths,
  assignments,
  scenarios,
  initialEditorPathId,
}: {
  isFacilitator: boolean;
  initialPaths: CoachingPathView[];
  assignments: CoachingAssignmentView[];
  scenarios: RoleplayScenarioView[];
  initialEditorPathId?: string;
}) {
  const router = useRouter();
  const initialEditing =
    initialPaths.find((path) => path.id === initialEditorPathId) ?? null;
  const [editorOpen, setEditorOpen] = useState(initialEditing !== null);
  const [editing, setEditing] = useState<CoachingPathView | null>(
    initialEditing,
  );
  const [startingId, setStartingId] = useState<string | null>(null);

  async function start(assignment: CoachingAssignmentView) {
    setStartingId(assignment.id);
    try {
      const result = await client.game.coachingPaths.startStep({
        assignmentId: assignment.id,
        mode: "full",
      });
      router.push(`/game/dialog/${result.dialog.id}`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось начать шаг",
      );
      setStartingId(null);
    }
  }

  if (!isFacilitator) {
    return (
      <>
        <GameSectionHeader
          eyebrow="Практика · Coaching Paths"
          title="Мои пути обучения"
          description="Проходите ролевые тренировки последовательно. Следующий шаг откроется после достижения проходного балла."
        />
        {assignments.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {assignments.map((assignment) => {
              const total = assignment.pathSnapshot.steps.length;
              const done = Math.min(assignment.currentStep, total);
              const progress = total > 0 ? Math.round((done / total) * 100) : 0;
              const next =
                assignment.pathSnapshot.steps[assignment.currentStep];
              return (
                <Card key={assignment.id} className="overflow-hidden">
                  <CardHeader>
                    <div>
                      <CardTitle>{assignment.pathSnapshot.name}</CardTitle>
                      <CardDescription>
                        {assignment.pathSnapshot.description ||
                          "Последовательная программа ролевых тренировок"}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        assignment.status === "completed"
                          ? "default"
                          : "outline"
                      }
                    >
                      {assignment.status === "completed"
                        ? "ЗАВЕРШЁН"
                        : "АКТИВЕН"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-center justify-between text-sm">
                      <span>Прогресс</span>
                      <span className="font-medium tabular-nums">
                        {done}/{total} · {progress}%
                      </span>
                    </div>
                    <Progress value={progress} />
                    {next ? (
                      <div className="flex items-center gap-3 rounded-xl border p-3">
                        <ScenarioAvatar scenario={next.scenario} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            Шаг {assignment.currentStep + 1}:{" "}
                            {next.scenario.employeeName}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">
                            {next.scenario.title} · минимум {next.minScore}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-primary/5 flex items-center gap-2 rounded-xl border p-3 text-sm">
                        <IconCheck className="text-primary size-5" />
                        Все шаги успешно пройдены
                      </div>
                    )}
                  </CardContent>
                  <CardFooter>
                    {next ? (
                      <Button
                        onClick={() => start(assignment)}
                        disabled={startingId === assignment.id}
                      >
                        <IconPlayerPlay data-icon="inline-start" />
                        {startingId === assignment.id
                          ? "Запускаем…"
                          : assignment.status === "assigned"
                            ? "Начать путь"
                            : "Продолжить"}
                      </Button>
                    ) : (
                      <Badge>
                        <IconCheck />
                        Готово
                      </Badge>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconRoute />
              </EmptyMedia>
              <EmptyTitle>Пока нет назначенных путей</EmptyTitle>
              <EmptyDescription>
                Когда ведущий назначит программу, она появится здесь.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                render={<Link href="/game/roleplay" />}
                nativeButton={false}
              >
                <IconPlayerPlay data-icon="inline-start" />
                Открыть AI Roleplay
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </>
    );
  }

  return (
    <>
      <GameSectionHeader
        eyebrow="Обучение"
        title="Пути обучения"
        description="Создавайте структурированные программы развития для команды."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <IconPlus data-icon="inline-start" />
            Создать путь
          </Button>
        }
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          AI Roleplay-сценарии, собранные в последовательную программу.
        </p>
        <Badge variant="outline">
          {initialPaths.length} {initialPaths.length === 1 ? "путь" : "путей"}
        </Badge>
      </div>
      {initialPaths.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {initialPaths.map((path) => (
            <Card key={path.id} className="group overflow-hidden">
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle className="truncate">{path.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {path.description || "Структурированный путь обучения"}
                  </CardDescription>
                </div>
                <Badge variant={path.isActive ? "default" : "outline"}>
                  {path.isActive ? "АКТИВЕН" : "ЧЕРНОВИК"}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-muted-foreground text-xs">Шагов</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {path.steps.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Участников</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {path.assignedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Завершили</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {path.completedCount ?? 0}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {path.steps.slice(0, 4).map((step) => (
                      <ScenarioAvatar key={step.id} scenario={step.scenario} />
                    ))}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {path.steps[0]?.scenario.employeeName}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {path.steps[0]?.scenario.title}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(path);
                    setEditorOpen(true);
                  }}
                >
                  Редактировать
                </Button>
                <Button
                  render={<Link href={`/game/coaching-paths/${path.id}`} />}
                  nativeButton={false}
                >
                  <IconUsers data-icon="inline-start" />
                  Открыть
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconRoute />
            </EmptyMedia>
            <EmptyTitle>Создайте первый путь обучения</EmptyTitle>
            <EmptyDescription>
              Добавьте AI Roleplay-сценарии, задайте проходной балл и назначьте
              участников.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setEditorOpen(true)}>
              <IconPlus data-icon="inline-start" />
              Создать путь
            </Button>
          </EmptyContent>
        </Empty>
      )}
      <PathEditor
        key={editing?.id ?? "new"}
        open={editorOpen}
        path={editing}
        scenarios={scenarios}
        onOpenChange={setEditorOpen}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
