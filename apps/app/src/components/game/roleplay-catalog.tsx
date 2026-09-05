"use client";

import type { RouterOutputs } from "@acme/api";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from "@acme/ui";
import {
  IconArchive,
  IconArrowLeft,
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconDots,
  IconEdit,
  IconHistory,
  IconMessages,
  IconMicrophone,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconTargetArrow,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { employeeAvatarUri } from "~/lib/avatar";
import { client } from "~/orpc/react";
import { GameSectionHeader } from "./game-section-header";

type RoleplayCategory =
  | "tasking"
  | "feedback"
  | "resistance"
  | "overload"
  | "delegation";
type EmployeeLevel = "L1" | "L2" | "L3" | "L4";
type RoleplayMode = "full" | "objections";

export type RoleplayScenarioView =
  RouterOutputs["game"]["roleplay"]["list"]["scenarios"][number];

export interface RoleplayAttemptView {
  scenarioId: string | null;
  sessionId: string;
  sessionStatus: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
  mode: string | null;
  dialogId: string | null;
  dialogStatus: string | null;
  scorePercent: number | null;
}

interface RoleplayReference {
  employees: Array<{
    id: string;
    name: string;
    role: string;
    level: string;
  }>;
  tasks: Array<{ id: string; title: string; type: string }>;
}

interface RoleplayCatalogProps {
  initialScenarios: RoleplayScenarioView[];
  attempts: RoleplayAttemptView[];
  reference: RoleplayReference;
}

const CATEGORY_LABELS: Record<RoleplayCategory, string> = {
  tasking: "Постановка задачи",
  feedback: "Обратная связь",
  resistance: "Сопротивление",
  overload: "Перегруз",
  delegation: "Делегирование",
};

const LEVEL_LABELS: Record<EmployeeLevel, string> = {
  L1: "L1 · новичок",
  L2: "L2 · осваивает",
  L3: "L3 · способен",
  L4: "L4 · эксперт",
};

const ALL_CATEGORY = "all";

interface ScenarioDraft {
  title: string;
  baseEmployeeId: string;
  baseTaskId: string;
  employeeName: string;
  employeeRole: string;
  employeeLevel: EmployeeLevel;
  category: RoleplayCategory;
  description: string;
  trainingObjectives: string;
  objections: string;
  privateBeliefs: string;
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function attemptLabel(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? "попыток"
      : lastDigit === 1
        ? "попытка"
        : lastDigit >= 2 && lastDigit <= 4
          ? "попытки"
          : "попыток";
  return `${count} ${suffix}`;
}

function emptyDraft(reference: RoleplayReference): ScenarioDraft {
  const employee = reference.employees[0];
  const task = reference.tasks[0];
  return {
    title: task?.title ?? "",
    baseEmployeeId: employee?.id ?? "",
    baseTaskId: task?.id ?? "",
    employeeName: employee?.name ?? "",
    employeeRole: employee?.role ?? "",
    employeeLevel: (employee?.level as EmployeeLevel) ?? "L2",
    category: "tasking",
    description: "",
    trainingObjectives: "",
    objections: "",
    privateBeliefs: "",
  };
}

function draftFromScenario(scenario: RoleplayScenarioView): ScenarioDraft {
  return {
    title: scenario.title,
    baseEmployeeId: scenario.baseEmployeeId,
    baseTaskId: scenario.baseTaskId,
    employeeName: scenario.employeeName,
    employeeRole: scenario.employeeRole,
    employeeLevel: scenario.employeeLevel,
    category: scenario.category,
    description: scenario.description,
    trainingObjectives: scenario.trainingObjectives.join("\n"),
    objections: scenario.objections.join("\n"),
    privateBeliefs: scenario.privateBeliefs.join("\n"),
  };
}

function ScenarioEditorDialog({
  open,
  scenario,
  reference,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  scenario: RoleplayScenarioView | null;
  reference: RoleplayReference;
  onOpenChange: (open: boolean) => void;
  onSaved: (scenario: RoleplayScenarioView) => void;
}) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ScenarioDraft>(() =>
    scenario ? draftFromScenario(scenario) : emptyDraft(reference),
  );
  const [pending, setPending] = useState(false);

  function reset(nextOpen: boolean) {
    if (nextOpen) {
      setStep(1);
      setDraft(scenario ? draftFromScenario(scenario) : emptyDraft(reference));
    }
    onOpenChange(nextOpen);
  }

  const stepOneValid =
    draft.baseEmployeeId.trim().length > 0 &&
    draft.employeeName.trim().length >= 2 &&
    draft.employeeRole.trim().length >= 2 &&
    draft.description.trim().length >= 20;
  const stepTwoValid =
    draft.title.trim().length >= 3 &&
    draft.baseTaskId.length > 0 &&
    lines(draft.trainingObjectives).length > 0;

  async function save() {
    if (pending || !stepOneValid || !stepTwoValid) return;
    setPending(true);
    try {
      const input = {
        title: draft.title.trim(),
        baseEmployeeId: draft.baseEmployeeId,
        baseTaskId: draft.baseTaskId,
        employeeName: draft.employeeName.trim(),
        employeeRole: draft.employeeRole.trim(),
        employeeLevel: draft.employeeLevel,
        category: draft.category,
        description: draft.description.trim(),
        trainingObjectives: lines(draft.trainingObjectives),
        objections: lines(draft.objections),
        privateBeliefs: lines(draft.privateBeliefs),
      };
      const saved = scenario
        ? await client.game.roleplay.update({ ...input, id: scenario.id })
        : await client.game.roleplay.create(input);
      onSaved(saved as RoleplayScenarioView);
      toast.success(scenario ? "Сценарий обновлён" : "Сценарий создан");
      onOpenChange(false);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить сценарий",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {scenario ? "Редактировать сценарий" : "Создать сценарий"}
          </DialogTitle>
          <DialogDescription>
            Соберите реалистичного сотрудника, ситуацию и цели тренировки.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Шаг {step} из 3</span>
            <span className="text-muted-foreground">
              {step === 1
                ? "Профиль сотрудника"
                : step === 2
                  ? "Ситуация и сопротивление"
                  : "Проверка и запуск"}
            </span>
          </div>
          <Progress value={(step / 3) * 100} />
        </div>

        {step === 1 ? (
          <FieldGroup>
            <Field>
              <FieldLabel>Основа поведения</FieldLabel>
              <Select
                value={draft.baseEmployeeId}
                onValueChange={(value) => {
                  const employee = reference.employees.find(
                    (item) => item.id === value,
                  );
                  if (!employee) return;
                  setDraft((current) => ({
                    ...current,
                    baseEmployeeId: employee.id,
                    employeeName: employee.name,
                    employeeRole: employee.role,
                    employeeLevel: employee.level as EmployeeLevel,
                  }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {reference.employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name} · {employee.role}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Базовый профиль задаёт характер реакции; имя и роль можно
                изменить.
              </FieldDescription>
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="roleplay-name">Имя сотрудника</FieldLabel>
                <Input
                  id="roleplay-name"
                  value={draft.employeeName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      employeeName: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="roleplay-role">Должность</FieldLabel>
                <Input
                  id="roleplay-role"
                  value={draft.employeeRole}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      employeeRole: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Уровень готовности</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={[draft.employeeLevel]}
                onValueChange={(values) => {
                  const level = values[0] as EmployeeLevel | undefined;
                  if (level) {
                    setDraft((current) => ({
                      ...current,
                      employeeLevel: level,
                    }));
                  }
                }}
              >
                {(Object.keys(LEVEL_LABELS) as EmployeeLevel[]).map((level) => (
                  <ToggleGroupItem key={level} value={level}>
                    {level}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field
              data-invalid={
                draft.description.length > 0 &&
                draft.description.trim().length < 20
              }
            >
              <FieldLabel htmlFor="roleplay-description">
                Контекст и поведение
              </FieldLabel>
              <Textarea
                id="roleplay-description"
                rows={5}
                value={draft.description}
                aria-invalid={
                  draft.description.length > 0 &&
                  draft.description.trim().length < 20
                }
                placeholder="Что происходит, чего хочет сотрудник и почему разговор может быть сложным?"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
              <FieldDescription>Не менее 20 символов.</FieldDescription>
            </Field>
          </FieldGroup>
        ) : null}

        {step === 2 ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="roleplay-title">
                Название ситуации
              </FieldLabel>
              <Input
                id="roleplay-title"
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>Рабочая задача</FieldLabel>
                <Select
                  value={draft.baseTaskId}
                  onValueChange={(value) => {
                    if (!value) return;
                    setDraft((current) => ({
                      ...current,
                      baseTaskId: value,
                    }));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {reference.tasks.map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Тип разговора</FieldLabel>
                <Select
                  value={draft.category}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      category: value as RoleplayCategory,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(Object.keys(CATEGORY_LABELS) as RoleplayCategory[]).map(
                        (category) => (
                          <SelectItem key={category} value={category}>
                            {CATEGORY_LABELS[category]}
                          </SelectItem>
                        ),
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="roleplay-objectives">
                Цели тренировки
              </FieldLabel>
              <Textarea
                id="roleplay-objectives"
                rows={4}
                value={draft.trainingObjectives}
                placeholder={
                  "Каждая цель с новой строки\nЗафиксировать ожидаемый результат\nПроверить понимание"
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    trainingObjectives: event.target.value,
                  }))
                }
              />
              <FieldDescription>
                До 10 целей, каждая с новой строки.
              </FieldDescription>
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="roleplay-objections">
                  Возражения
                </FieldLabel>
                <Textarea
                  id="roleplay-objections"
                  rows={5}
                  value={draft.objections}
                  placeholder="Каждое возражение с новой строки"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      objections: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="roleplay-beliefs">
                  Скрытые установки
                </FieldLabel>
                <Textarea
                  id="roleplay-beliefs"
                  rows={5}
                  value={draft.privateBeliefs}
                  placeholder="Что сотрудник думает, но не говорит сразу"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      privateBeliefs: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
          </FieldGroup>
        ) : null}

        {step === 3 ? (
          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <Avatar className="size-12">
                  <AvatarImage
                    src={employeeAvatarUri(draft.employeeName)}
                    alt={draft.employeeName}
                  />
                  <AvatarFallback>
                    {initials(draft.employeeName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <CardTitle>{draft.employeeName}</CardTitle>
                  <CardDescription>{draft.employeeRole}</CardDescription>
                </div>
                <Badge variant="outline" className="ml-auto">
                  {LEVEL_LABELS[draft.employeeLevel]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="font-medium">{draft.title}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {draft.description}
                </p>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <ReviewList
                  title="Цели тренировки"
                  values={lines(draft.trainingObjectives)}
                />
                <ReviewList
                  title="Вероятные возражения"
                  values={lines(draft.objections)}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <DialogFooter className="justify-between">
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              step === 1 ? onOpenChange(false) : setStep(step - 1)
            }
          >
            {step > 1 ? <IconArrowLeft data-icon="inline-start" /> : null}
            {step === 1 ? "Отмена" : "Назад"}
          </Button>
          {step < 3 ? (
            <Button
              disabled={step === 1 ? !stepOneValid : !stepTwoValid}
              onClick={() => setStep(step + 1)}
            >
              Продолжить
              <IconArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button disabled={pending} onClick={save}>
              <IconCheck data-icon="inline-start" />
              {pending
                ? "Сохраняем…"
                : scenario
                  ? "Сохранить изменения"
                  : "Создать сценарий"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      {values.length > 0 ? (
        <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
          {values.map((value) => (
            <li key={value} className="flex gap-2">
              <IconCheck className="text-primary mt-0.5 size-4 shrink-0" />
              <span>{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Не указаны</p>
      )}
    </div>
  );
}

function StartTrainingDialog({
  scenario,
  open,
  onOpenChange,
}: {
  scenario: RoleplayScenarioView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<RoleplayMode>("full");
  const [pending, setPending] = useState(false);

  async function start() {
    if (!scenario || pending) return;
    setPending(true);
    try {
      const result = await client.game.roleplay.start({
        scenarioId: scenario.id,
        mode,
      });
      router.push(`/game/dialog/${result.dialog.id}?voice=1`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось начать тренировку",
      );
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Начать тренировку</DialogTitle>
          <DialogDescription>
            Проверьте контекст и выберите формат разговора.
          </DialogDescription>
        </DialogHeader>
        {scenario ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <Avatar className="size-14">
                <AvatarImage
                  src={employeeAvatarUri(scenario.employeeName)}
                  alt={scenario.employeeName}
                />
                <AvatarFallback>
                  {initials(scenario.employeeName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{scenario.employeeName}</h3>
                <p className="text-muted-foreground text-sm">
                  {scenario.employeeRole}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {CATEGORY_LABELS[scenario.category]}
                  </Badge>
                  <Badge variant="outline">
                    {LEVEL_LABELS[scenario.employeeLevel]}
                  </Badge>
                </div>
              </div>
            </div>
            <p className="text-muted-foreground text-sm leading-6">
              {scenario.description}
            </p>
            <Separator />
            <ReviewList
              title="Цели тренировки"
              values={scenario.trainingObjectives}
            />
            {scenario.objections.length > 0 ? (
              <ReviewList
                title="Вероятные возражения"
                values={scenario.objections}
              />
            ) : null}
            <Field>
              <FieldLabel>Формат тренировки</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={[mode]}
                onValueChange={(values) => {
                  const next = values[0] as RoleplayMode | undefined;
                  if (next) setMode(next);
                }}
              >
                <ToggleGroupItem value="full">Полный разговор</ToggleGroupItem>
                <ToggleGroupItem value="objections">
                  Только возражения
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {mode === "full"
                  ? "Пройдите путь от открытия разговора до договорённости."
                  : "Персонаж быстрее перейдёт к сопротивлению и сложным вопросам."}
              </FieldDescription>
            </Field>
            <Alert>
              <IconMicrophone />
              <AlertTitle>Живой голосовой разговор</AlertTitle>
              <AlertDescription>
                После запуска откроется отдельная комната. Разрешите доступ к
                микрофону, говорите естественно и получайте озвученные ответы
                персонажа с транскриптом в реальном времени.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        <DialogFooter className="justify-end">
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
          <Button disabled={pending || !scenario} onClick={start}>
            <IconPlayerPlay data-icon="inline-start" />
            {pending ? "Подключаем…" : "Перейти в голосовую комнату"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioDetailsDialog({
  scenario,
  attempts,
  open,
  onOpenChange,
  onStart,
}: {
  scenario: RoleplayScenarioView | null;
  attempts: RoleplayAttemptView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: () => void;
}) {
  const scenarioAttempts = scenario
    ? attempts.filter((attempt) => attempt.scenarioId === scenario.id)
    : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{scenario?.title ?? "Сценарий"}</DialogTitle>
          <DialogDescription>
            Подробности ситуации и история ваших попыток.
          </DialogDescription>
        </DialogHeader>
        {scenario ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarImage
                  src={employeeAvatarUri(scenario.employeeName)}
                  alt={scenario.employeeName}
                />
                <AvatarFallback>
                  {initials(scenario.employeeName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{scenario.employeeName}</p>
                <p className="text-muted-foreground text-sm">
                  {scenario.employeeRole}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm leading-6">
              {scenario.description}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <ReviewList
                title="Цели тренировки"
                values={scenario.trainingObjectives}
              />
              <ReviewList title="Возражения" values={scenario.objections} />
            </div>
            <Separator />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">История попыток</p>
                <Badge variant="outline">{scenarioAttempts.length}</Badge>
              </div>
              {scenarioAttempts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {scenarioAttempts.slice(0, 5).map((attempt) => (
                    <Link
                      key={attempt.sessionId}
                      href={
                        attempt.dialogId
                          ? attempt.dialogStatus === "active"
                            ? `/game/dialog/${attempt.dialogId}?voice=1`
                            : `/game/dialog/${attempt.dialogId}/report`
                          : `/game/${attempt.sessionId}`
                      }
                      className="hover:bg-muted flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
                    >
                      <span>
                        <span className="block text-sm font-medium">
                          {new Intl.DateTimeFormat("ru-RU", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(attempt.startedAt))}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {attempt.mode === "objections"
                            ? "Только возражения"
                            : "Полный разговор"}
                        </span>
                      </span>
                      <Badge variant="secondary">
                        {attempt.scorePercent == null
                          ? attempt.dialogStatus === "active"
                            ? "Идёт"
                            : "Без оценки"
                          : `${attempt.scorePercent}%`}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Попыток пока нет — начните первую тренировку.
                </p>
              )}
            </div>
          </div>
        ) : null}
        <DialogFooter className="justify-end">
          <Button onClick={onStart}>
            <IconPlayerPlay data-icon="inline-start" />
            Начать тренировку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoleplayCatalog({
  initialScenarios,
  attempts,
  reference,
}: RoleplayCatalogProps) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [level, setLevel] = useState("all");
  const [ownership, setOwnership] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RoleplayScenarioView | null>(null);
  const [starting, setStarting] = useState<RoleplayScenarioView | null>(null);
  const [details, setDetails] = useState<RoleplayScenarioView | null>(null);
  const [archiving, setArchiving] = useState<RoleplayScenarioView | null>(null);
  const [mutationPending, setMutationPending] = useState(false);

  const attemptCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const attempt of attempts) {
      if (!attempt.scenarioId) continue;
      map.set(attempt.scenarioId, (map.get(attempt.scenarioId) ?? 0) + 1);
    }
    return map;
  }, [attempts]);

  const latestAttempt = attempts[0];
  const latestScenario = latestAttempt
    ? scenarios.find((item) => item.id === latestAttempt.scenarioId)
    : undefined;

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    const values = scenarios.filter((scenario) => {
      const matchesQuery =
        query.length === 0 ||
        [
          scenario.title,
          scenario.employeeName,
          scenario.employeeRole,
          scenario.description,
          CATEGORY_LABELS[scenario.category],
        ].some((value) => value.toLocaleLowerCase("ru-RU").includes(query));
      return (
        matchesQuery &&
        (category === ALL_CATEGORY || scenario.category === category) &&
        (level === "all" || scenario.employeeLevel === level) &&
        (ownership === "all" ||
          (ownership === "custom"
            ? scenario.source === "custom"
            : scenario.source === "template"))
      );
    });
    return values.sort((left, right) => {
      if (sort === "name") return left.title.localeCompare(right.title, "ru");
      if (sort === "recent") {
        return (
          Number(new Date(right.updatedAt ?? 0)) -
          Number(new Date(left.updatedAt ?? 0))
        );
      }
      if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
      return (
        (attemptCount.get(right.id) ?? 0) - (attemptCount.get(left.id) ?? 0)
      );
    });
  }, [attemptCount, category, level, ownership, scenarios, search, sort]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function upsertScenario(saved: RoleplayScenarioView) {
    setScenarios((current) => {
      const exists = current.some((item) => item.id === saved.id);
      return exists
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current];
    });
  }

  async function toggleFavorite(scenario: RoleplayScenarioView) {
    if (scenario.source !== "custom" || mutationPending) return;
    setMutationPending(true);
    try {
      const updated = await client.game.roleplay.setFavorite({
        id: scenario.id,
        isFavorite: !scenario.isFavorite,
      });
      upsertScenario(updated as RoleplayScenarioView);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось изменить избранное",
      );
    } finally {
      setMutationPending(false);
    }
  }

  async function archiveScenario() {
    if (!archiving || mutationPending) return;
    setMutationPending(true);
    try {
      await client.game.roleplay.archive({ id: archiving.id });
      setScenarios((current) =>
        current.filter((item) => item.id !== archiving.id),
      );
      toast.success("Сценарий перенесён в архив");
      setArchiving(null);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось архивировать",
      );
    } finally {
      setMutationPending(false);
    }
  }

  return (
    <>
      <GameSectionHeader
        eyebrow="Практика · Ролевые диалоги с ИИ"
        title="Управленческие ролевые тренировки"
        description="Выберите готовую ситуацию или создайте собственного сотрудника. Проведите живой разговор и получите разбор управленческого подхода."
        action={
          <Button onClick={openCreate}>
            <IconPlus data-icon="inline-start" />
            Создать сценарий
          </Button>
        }
      />

      {latestScenario && latestAttempt ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-base">Продолжить тренировку</CardTitle>
              <CardDescription>
                Вернитесь к последнему персонажу или начните новую попытку.
              </CardDescription>
            </div>
            <Badge variant="outline">Последняя</Badge>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              className="hover:bg-muted flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors"
              onClick={() => {
                if (latestAttempt.dialogId) {
                  router.push(
                    latestAttempt.dialogStatus === "active"
                      ? `/game/dialog/${latestAttempt.dialogId}?voice=1`
                      : `/game/dialog/${latestAttempt.dialogId}/report`,
                  );
                } else {
                  setStarting(latestScenario);
                }
              }}
            >
              <Avatar className="size-10">
                <AvatarImage
                  src={employeeAvatarUri(latestScenario.employeeName)}
                  alt={latestScenario.employeeName}
                />
                <AvatarFallback>
                  {initials(latestScenario.employeeName)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {latestScenario.employeeName}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {latestScenario.title} ·{" "}
                  {CATEGORY_LABELS[latestScenario.category]}
                </span>
              </span>
              <IconArrowRight className="text-muted-foreground size-4" />
            </button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-base">Найти ситуацию</CardTitle>
            <CardDescription>
              Фильтруйте по типу разговора, уровню сотрудника и источнику.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative">
            <IconSearch className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по сотруднику, роли или ситуации"
              className="pl-9"
            />
          </div>
          <div className="overflow-x-auto pb-1">
            <ToggleGroup
              variant="outline"
              value={[category]}
              onValueChange={(values) => setCategory(values[0] ?? ALL_CATEGORY)}
            >
              <ToggleGroupItem value={ALL_CATEGORY}>Все</ToggleGroupItem>
              {(Object.keys(CATEGORY_LABELS) as RoleplayCategory[]).map(
                (item) => (
                  <ToggleGroupItem key={item} value={item}>
                    {CATEGORY_LABELS[item]}
                  </ToggleGroupItem>
                ),
              )}
            </ToggleGroup>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              value={level}
              onValueChange={(value) => {
                if (value) setLevel(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Все уровни</SelectItem>
                  {(Object.keys(LEVEL_LABELS) as EmployeeLevel[]).map(
                    (item) => (
                      <SelectItem key={item} value={item}>
                        {LEVEL_LABELS[item]}
                      </SelectItem>
                    ),
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={ownership}
              onValueChange={(value) => {
                if (value) setOwnership(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Все сценарии</SelectItem>
                  <SelectItem value="template">Готовые шаблоны</SelectItem>
                  <SelectItem value="custom">Мои сценарии</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(value) => {
                if (value) setSort(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="recommended">Рекомендованные</SelectItem>
                  <SelectItem value="recent">Недавно изменённые</SelectItem>
                  <SelectItem value="name">По названию</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Все сценарии</h2>
            <p className="text-muted-foreground text-sm">
              Готовые ситуации и ваши собственные персонажи.
            </p>
          </div>
          <Badge variant="outline">Найдено: {filtered.length}</Badge>
        </div>

        {filtered.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((scenario) => (
              <Card key={scenario.id} className="overflow-hidden py-0">
                <div className="from-primary/20 via-muted to-accent/30 flex h-28 items-end bg-gradient-to-br p-4">
                  <Avatar className="size-12 border-2 border-background">
                    <AvatarImage
                      src={employeeAvatarUri(scenario.employeeName)}
                      alt={scenario.employeeName}
                    />
                    <AvatarFallback>
                      {initials(scenario.employeeName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-auto flex gap-1">
                    {scenario.source === "custom" ? (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={
                          scenario.isFavorite
                            ? "Убрать из избранного"
                            : "Добавить в избранное"
                        }
                        disabled={mutationPending}
                        onClick={() => toggleFavorite(scenario)}
                      >
                        {scenario.isFavorite ? (
                          <IconStarFilled />
                        ) : (
                          <IconStar />
                        )}
                      </Button>
                    ) : null}
                    {scenario.source === "custom" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label="Действия со сценарием"
                            />
                          }
                        >
                          <IconDots />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(scenario);
                                setEditorOpen(true);
                              }}
                            >
                              <IconEdit />
                              Редактировать
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setArchiving(scenario)}
                            >
                              <IconArchive />В архив
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {scenario.employeeName}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {scenario.employeeRole}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{scenario.employeeLevel}</Badge>
                </CardHeader>
                <CardContent className="flex min-h-48 flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {CATEGORY_LABELS[scenario.category]}
                    </Badge>
                    {scenario.source === "custom" ? (
                      <Badge variant="outline">Мой сценарий</Badge>
                    ) : null}
                  </div>
                  <div>
                    <p className="font-medium">{scenario.title}</p>
                    <p className="text-muted-foreground mt-1 line-clamp-4 text-sm leading-5">
                      {scenario.description}
                    </p>
                  </div>
                  <div className="text-muted-foreground mt-auto flex items-center gap-1.5 text-xs">
                    <IconHistory className="size-4" />
                    {attemptLabel(attemptCount.get(scenario.id) ?? 0)}
                  </div>
                </CardContent>
                <CardFooter className="border-t py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetails(scenario)}
                  >
                    Подробнее
                  </Button>
                  <Button size="sm" onClick={() => setStarting(scenario)}>
                    <IconPlayerPlay data-icon="inline-start" />
                    Начать
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconSearch />
              </EmptyMedia>
              <EmptyTitle>Сценарии не найдены</EmptyTitle>
              <EmptyDescription>
                Измените фильтры или создайте собственную ситуацию.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={openCreate}>
                <IconPlus data-icon="inline-start" />
                Создать сценарий
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconSparkles className="size-5" />
              Как работают ролевые диалоги с ИИ
            </CardTitle>
            <CardDescription>
              Персонаж знает свой контекст, сопротивляется в рамках роли, а
              после разговора вы получаете оценку управленческого подхода.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: IconUsers,
              title: "Реалистичный персонаж",
              text: "Уровень готовности, характер, скрытые установки и рабочий контекст.",
            },
            {
              icon: IconMessages,
              title: "Живой разговор",
              text: "Голос или текст, полный диалог либо сфокусированная отработка возражений.",
            },
            {
              icon: IconTargetArrow,
              title: "Разбор результата",
              text: "Стиль руководства, выполненные критерии и конкретный следующий фокус.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 rounded-lg border p-4">
              <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                <item.icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="text-muted-foreground mt-1 block text-sm leading-5">
                  {item.text}
                </span>
              </span>
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button onClick={openCreate}>
            <IconPlus data-icon="inline-start" />
            Создать свой сценарий
          </Button>
          <Badge variant="outline">
            <IconBolt /> Работает на существующем AI-движке
          </Badge>
        </CardFooter>
      </Card>

      <ScenarioEditorDialog
        key={editing?.id ?? "new"}
        open={editorOpen}
        scenario={editing}
        reference={reference}
        onOpenChange={setEditorOpen}
        onSaved={upsertScenario}
      />
      <StartTrainingDialog
        key={starting?.id ?? "start"}
        scenario={starting}
        open={Boolean(starting)}
        onOpenChange={(open) => {
          if (!open) setStarting(null);
        }}
      />
      <ScenarioDetailsDialog
        key={details?.id ?? "details"}
        scenario={details}
        attempts={attempts}
        open={Boolean(details)}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
        onStart={() => {
          if (details) setStarting(details);
          setDetails(null);
        }}
      />
      <AlertDialog
        open={Boolean(archiving)}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Архивировать сценарий?</AlertDialogTitle>
            <AlertDialogDescription>
              Он исчезнет из каталога, но история тренировок и отчёты
              сохранятся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutationPending}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutationPending}
              onClick={archiveScenario}
            >
              {mutationPending ? "Архивируем…" : "В архив"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
