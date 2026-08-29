"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
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
  Textarea,
  toast,
} from "@acme/ui";
import {
  IconArchive,
  IconCheck,
  IconChevronRight,
  IconDots,
  IconEdit,
  IconPlus,
  IconSparkles,
  IconTargetArrow,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { client } from "~/orpc/react";

const BUILTIN_CRITERIA = [
  ["clarify_task", "Чётко поставил задачу"],
  ["set_deadline", "Обозначил срок"],
  ["explain_how", "Объяснил способ выполнения"],
  ["set_checkpoints", "Назначил точки контроля"],
  ["check_understanding", "Проверил понимание"],
  ["motivate", "Поддержал и замотивировал"],
  ["ask_opinion", "Спросил мнение сотрудника"],
  ["offer_help", "Предложил помощь или ресурсы"],
  ["delegate_authority", "Передал ответственность"],
  ["avoid_micromanagement", "Избежал микроменеджмента"],
  ["prioritize", "Расставил приоритеты"],
  ["reduce_scope", "Снизил нагрузку или объём"],
] as const;

type CriterionId = (typeof BUILTIN_CRITERIA)[number][0];

interface ScorecardCriterion {
  criterionId: CriterionId;
  title: string;
  description: string;
  weight: number;
  required: boolean;
  scoring: "percent" | "pass_fail";
  condition?: string;
}

interface ScorecardCategory {
  id: string;
  name: string;
  weight: number;
  criteria: ScorecardCriterion[];
}

export interface ScorecardView {
  id: string;
  source: "custom";
  name: string;
  description: string;
  categories: ScorecardCategory[];
  isActive: boolean;
  criteriaCount: number;
  createdAt?: Date | string;
  updatedAt?: Date | string | null;
}

export interface ScorecardTemplateView {
  id: string;
  name: string;
  description: string;
  categories: ScorecardCategory[];
}

interface SystemScorecardView {
  id: "system";
  source: "system";
  name: string;
  description: string;
  criteriaCount: number;
  isActive: boolean;
}

interface ScorecardDraft {
  name: string;
  description: string;
  categories: ScorecardCategory[];
}

function cloneCategories(categories: ScorecardCategory[]) {
  return categories.map((category) => ({
    ...category,
    criteria: category.criteria.map((criterion) => ({ ...criterion })),
  }));
}

function blankDraft(): ScorecardDraft {
  return {
    name: "",
    description: "",
    categories: [
      {
        id: crypto.randomUUID(),
        name: "Основные навыки",
        weight: 100,
        criteria: [
          {
            criterionId: "clarify_task",
            title: "Чётко поставил задачу",
            description: "AI проверяет, прозвучал ли ожидаемый результат.",
            weight: 3,
            required: true,
            scoring: "percent",
          },
        ],
      },
    ],
  };
}

function draftFromTemplate(template: ScorecardTemplateView): ScorecardDraft {
  return {
    name: template.name,
    description: template.description,
    categories: cloneCategories(template.categories),
  };
}

function criteriaCount(categories: ScorecardCategory[]) {
  return categories.reduce(
    (sum, category) => sum + category.criteria.length,
    0,
  );
}

function ScorecardEditor({
  open,
  scorecard,
  initialDraft,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  scorecard: ScorecardView | null;
  initialDraft: ScorecardDraft;
  onOpenChange: (open: boolean) => void;
  onSaved: (scorecard: ScorecardView) => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [pending, setPending] = useState(false);
  const totalWeight = draft.categories.reduce(
    (sum, category) => sum + category.weight,
    0,
  );
  const usedIds = new Set(
    draft.categories.flatMap((category) =>
      category.criteria.map((criterion) => criterion.criterionId),
    ),
  );
  const unusedCriteria = BUILTIN_CRITERIA.filter(([id]) => !usedIds.has(id));
  const valid =
    draft.name.trim().length >= 2 &&
    totalWeight === 100 &&
    draft.categories.length > 0 &&
    draft.categories.every(
      (category) =>
        category.name.trim().length >= 2 && category.criteria.length > 0,
    ) &&
    draft.categories.some((category) =>
      category.criteria.some((criterion) => criterion.required),
    );

  function updateCategory(
    categoryIndex: number,
    update: (category: ScorecardCategory) => ScorecardCategory,
  ) {
    setDraft((current) => ({
      ...current,
      categories: current.categories.map((category, index) =>
        index === categoryIndex ? update(category) : category,
      ),
    }));
  }

  function addCategory() {
    const nextCount = draft.categories.length + 1;
    const baseWeight = Math.floor(100 / nextCount);
    const categories = draft.categories.map((category) => ({
      ...category,
      weight: baseWeight,
    }));
    categories.push({
      id: crypto.randomUUID(),
      name: `Категория ${nextCount}`,
      weight: 100 - baseWeight * (nextCount - 1),
      criteria: unusedCriteria[0]
        ? [
            {
              criterionId: unusedCriteria[0][0],
              title: unusedCriteria[0][1],
              description: "AI проверяет, проявилось ли действие в разговоре.",
              weight: 2,
              required: true,
              scoring: "percent",
            },
          ]
        : [],
    });
    setDraft((current) => ({ ...current, categories }));
  }

  function removeCategory(categoryIndex: number) {
    const remaining = draft.categories.filter(
      (_, index) => index !== categoryIndex,
    );
    if (remaining.length === 0) return;
    const baseWeight = Math.floor(100 / remaining.length);
    setDraft((current) => ({
      ...current,
      categories: remaining.map((category, index) => ({
        ...category,
        weight:
          index === remaining.length - 1
            ? 100 - baseWeight * (remaining.length - 1)
            : baseWeight,
      })),
    }));
  }

  async function save(activate: boolean) {
    if (!valid || pending) return;
    setPending(true);
    try {
      const values = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        categories: draft.categories,
      };
      const saved = scorecard
        ? await client.org.scorecards.update({ ...values, id: scorecard.id })
        : await client.org.scorecards.create({ ...values, activate });
      if (scorecard && activate && !scorecard.isActive) {
        await client.org.scorecards.activate({ id: saved.id });
      }
      onSaved({
        ...saved,
        isActive: activate || saved.isActive,
      } as ScorecardView);
      toast.success(scorecard ? "Scorecard обновлён" : "Scorecard создан");
      onOpenChange(false);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить Scorecard",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {scorecard ? "Редактировать Scorecard" : "Новый Scorecard"}
          </DialogTitle>
          <DialogDescription>
            Настройте, какие управленческие действия AI оценивает после
            разговора.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="scorecard-name">Название</FieldLabel>
              <Input
                id="scorecard-name"
                value={draft.name}
                placeholder="Например, Сильная постановка задачи"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="scorecard-description">Описание</FieldLabel>
              <Input
                id="scorecard-description"
                value={draft.description}
                placeholder="Когда и зачем использовать эту рубрику"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Распределение веса</span>
              <span
                className={
                  totalWeight === 100
                    ? "text-primary tabular-nums"
                    : "text-destructive tabular-nums"
                }
              >
                {totalWeight}/100
              </span>
            </div>
            <Progress value={Math.min(100, totalWeight)} className="mt-3" />
          </div>

          <div className="flex flex-col gap-4">
            {draft.categories.map((category, categoryIndex) => (
              <Card key={category.id} className="gap-0 overflow-hidden py-0">
                <CardHeader className="border-b py-4">
                  <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_8rem]">
                    <Field>
                      <FieldLabel htmlFor={`category-${category.id}`}>
                        Категория
                      </FieldLabel>
                      <Input
                        id={`category-${category.id}`}
                        value={category.name}
                        onChange={(event) =>
                          updateCategory(categoryIndex, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`weight-${category.id}`}>
                        Вес, %
                      </FieldLabel>
                      <Input
                        id={`weight-${category.id}`}
                        type="number"
                        min={1}
                        max={100}
                        value={category.weight}
                        onChange={(event) =>
                          updateCategory(categoryIndex, (current) => ({
                            ...current,
                            weight: Number(event.target.value),
                          }))
                        }
                      />
                    </Field>
                  </div>
                  {draft.categories.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      className="size-8"
                      variant="ghost"
                      aria-label="Удалить категорию"
                      onClick={() => removeCategory(categoryIndex)}
                    >
                      <IconTrash />
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-3 py-4">
                  {category.criteria.map((criterion, criterionIndex) => (
                    <div
                      key={criterion.criterionId}
                      className="grid gap-4 rounded-xl border bg-muted/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Badge variant="outline">
                          Критерий {criterionIndex + 1}
                        </Badge>
                        <Button
                          type="button"
                          size="icon"
                          className="size-8"
                          variant="ghost"
                          disabled={category.criteria.length === 1}
                          aria-label="Удалить критерий"
                          onClick={() =>
                            updateCategory(categoryIndex, (current) => ({
                              ...current,
                              criteria: current.criteria.filter(
                                (_, index) => index !== criterionIndex,
                              ),
                            }))
                          }
                        >
                          <IconTrash />
                        </Button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-[1fr_10rem]">
                        <Field>
                          <FieldLabel>Название критерия</FieldLabel>
                          <Input
                            value={criterion.title}
                            onChange={(event) =>
                              updateCategory(categoryIndex, (current) => ({
                                ...current,
                                criteria: current.criteria.map((item, index) =>
                                  index === criterionIndex
                                    ? { ...item, title: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Баллы</FieldLabel>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={criterion.weight}
                            onChange={(event) =>
                              updateCategory(categoryIndex, (current) => ({
                                ...current,
                                criteria: current.criteria.map((item, index) =>
                                  index === criterionIndex
                                    ? {
                                        ...item,
                                        weight: Number(event.target.value),
                                      }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </Field>
                      </div>
                      <Field>
                        <FieldLabel>Что должен оценить AI</FieldLabel>
                        <Textarea
                          rows={2}
                          value={criterion.description}
                          onChange={(event) =>
                            updateCategory(categoryIndex, (current) => ({
                              ...current,
                              criteria: current.criteria.map((item, index) =>
                                index === criterionIndex
                                  ? { ...item, description: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </Field>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel>Шкала</FieldLabel>
                          <Select
                            value={criterion.scoring}
                            onValueChange={(value) =>
                              updateCategory(categoryIndex, (current) => ({
                                ...current,
                                criteria: current.criteria.map((item, index) =>
                                  index === criterionIndex
                                    ? {
                                        ...item,
                                        scoring: value as
                                          | "percent"
                                          | "pass_fail",
                                      }
                                    : item,
                                ),
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="percent">0–100%</SelectItem>
                                <SelectItem value="pass_fail">
                                  Выполнено / нет
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel>Применять, когда</FieldLabel>
                          <Input
                            value={criterion.condition ?? ""}
                            placeholder="Всегда"
                            onChange={(event) =>
                              updateCategory(categoryIndex, (current) => ({
                                ...current,
                                criteria: current.criteria.map((item, index) =>
                                  index === criterionIndex
                                    ? {
                                        ...item,
                                        condition:
                                          event.target.value || undefined,
                                      }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </Field>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          id={`required-${category.id}-${criterion.criterionId}`}
                          checked={criterion.required}
                          onCheckedChange={(checked) =>
                            updateCategory(categoryIndex, (current) => ({
                              ...current,
                              criteria: current.criteria.map((item, index) =>
                                index === criterionIndex
                                  ? { ...item, required: checked }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <label
                          htmlFor={`required-${category.id}-${criterion.criterionId}`}
                        >
                          Обязательный критерий
                        </label>
                      </div>
                    </div>
                  ))}

                  {unusedCriteria.length > 0 ? (
                    <Field>
                      <FieldLabel>Добавить критерий</FieldLabel>
                      <Select
                        value={null}
                        onValueChange={(value) => {
                          const option = BUILTIN_CRITERIA.find(
                            ([id]) => id === value,
                          );
                          if (!option) return;
                          updateCategory(categoryIndex, (current) => ({
                            ...current,
                            criteria: [
                              ...current.criteria,
                              {
                                criterionId: option[0],
                                title: option[1],
                                description:
                                  "AI проверяет, проявилось ли действие в разговоре.",
                                weight: 2,
                                required: true,
                                scoring: "percent",
                              },
                            ],
                          }));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Выберите методический сигнал" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {unusedCriteria.map(([id, title]) => (
                              <SelectItem key={id} value={id}>
                                {title}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {draft.categories.length < 6 && unusedCriteria.length > 0 ? (
            <Button type="button" variant="outline" onClick={addCategory}>
              <IconPlus /> Добавить категорию
            </Button>
          ) : null}
        </FieldGroup>

        <DialogFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          {!scorecard ? (
            <Button
              variant="outline"
              disabled={!valid || pending}
              onClick={() => save(false)}
            >
              Сохранить в библиотеку
            </Button>
          ) : null}
          <Button
            disabled={!valid || pending}
            onClick={() => save(scorecard?.isActive ?? true)}
          >
            {pending
              ? "Сохраняем…"
              : scorecard
                ? "Сохранить"
                : "Создать и активировать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScorecardLibrary({
  initialSystem,
  initialTemplates,
  initialScorecards,
}: {
  initialSystem: SystemScorecardView;
  initialTemplates: ScorecardTemplateView[];
  initialScorecards: ScorecardView[];
}) {
  const [system, setSystem] = useState(initialSystem);
  const [scorecards, setScorecards] = useState(initialScorecards);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScorecardView | null>(null);
  const [editorDraft, setEditorDraft] = useState<ScorecardDraft>(blankDraft);
  const [archiving, setArchiving] = useState<ScorecardView | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const active = scorecards.find((scorecard) => scorecard.isActive) ?? system;
  const library = useMemo(
    () => scorecards.filter((scorecard) => !scorecard.isActive),
    [scorecards],
  );

  function openEditor(
    draft: ScorecardDraft,
    scorecard: ScorecardView | null = null,
  ) {
    setEditing(scorecard);
    setEditorDraft(draft);
    setChooserOpen(false);
    setEditorOpen(true);
  }

  async function activate(id: string) {
    if (pendingId) return;
    setPendingId(id);
    try {
      await client.org.scorecards.activate({ id });
      setSystem((current) => ({ ...current, isActive: id === "system" }));
      setScorecards((current) =>
        current.map((scorecard) => ({
          ...scorecard,
          isActive: scorecard.id === id,
        })),
      );
      toast.success("Активная рубрика изменена");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось активировать рубрику",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function archiveScorecard() {
    if (!archiving) return;
    setPendingId(archiving.id);
    try {
      await client.org.scorecards.archive({ id: archiving.id });
      setScorecards((current) =>
        current.filter((item) => item.id !== archiving.id),
      );
      if (archiving.isActive)
        setSystem((current) => ({ ...current, isActive: true }));
      setArchiving(null);
      toast.success("Scorecard перемещён в архив");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось архивировать Scorecard",
      );
    } finally {
      setPendingId(null);
    }
  }

  function handleSaved(saved: ScorecardView) {
    setScorecards((current) => {
      const exists = current.some((item) => item.id === saved.id);
      const normalized = saved.isActive
        ? current.map((item) => ({ ...item, isActive: false }))
        : current;
      return exists
        ? normalized.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...normalized];
    });
    if (saved.isActive)
      setSystem((current) => ({ ...current, isActive: false }));
  }

  const renderCard = (scorecard: ScorecardView) => (
    <Card
      key={scorecard.id}
      className="group gap-4 transition-colors hover:border-foreground/20"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/40">
            <IconTargetArrow className="size-4" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon"
                  className="size-8"
                  variant="ghost"
                  aria-label="Действия"
                />
              }
            >
              <IconDots />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  openEditor(
                    {
                      name: scorecard.name,
                      description: scorecard.description,
                      categories: cloneCategories(scorecard.categories),
                    },
                    scorecard,
                  )
                }
              >
                <IconEdit /> Редактировать
              </DropdownMenuItem>
              {!scorecard.isActive ? (
                <DropdownMenuItem onClick={() => activate(scorecard.id)}>
                  <IconCheck /> Сделать активным
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setArchiving(scorecard)}
              >
                <IconArchive /> В архив
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardTitle>{scorecard.name}</CardTitle>
        <CardDescription className="line-clamp-2 min-h-10">
          {scorecard.description || "Пользовательская рубрика оценки."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {scorecard.categories.slice(0, 3).map((category) => (
          <Badge key={category.id} variant="outline">
            {category.name}
          </Badge>
        ))}
      </CardContent>
      <CardFooter className="mt-auto justify-between border-t pt-4">
        <span className="text-muted-foreground text-xs">
          {scorecard.criteriaCount} критериев
        </span>
        {scorecard.isActive ? (
          <Badge variant="accent">Активен</Badge>
        ) : (
          <Badge variant="secondary">Не назначен</Badge>
        )}
      </CardFooter>
    </Card>
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-medium tracking-[-0.035em]">
            Scorecards
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            AI автоматически оценивает каждую завершённую смену и AI Roleplay по
            активной рубрике команды.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{scorecards.length + 1} рубрик</Badge>
            <Badge variant="outline">Каждая новая сессия</Badge>
            <Badge variant="accent">{active.name}</Badge>
          </div>
        </div>
        <Button onClick={() => setChooserOpen(true)}>
          <IconPlus /> Создать Scorecard
        </Button>
      </header>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Активная рубрика</h2>
          <p className="text-muted-foreground text-sm">
            Закрепляется в момент запуска и не меняет уже начатые сессии.
          </p>
        </div>
        {active.source === "system" ? (
          <Card className="border-primary/30 bg-primary/[0.025]">
            <CardHeader className="sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge variant="accent" className="mb-3">
                  Активен
                </Badge>
                <CardTitle className="flex items-center gap-2">
                  <IconSparkles /> {active.name}
                </CardTitle>
                <CardDescription className="mt-2 max-w-2xl">
                  {active.description}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{active.criteriaCount} сигналов</Badge>
                <Badge variant="outline">AI Roleplay</Badge>
                <Badge variant="outline">Деловая игра</Badge>
              </div>
            </CardHeader>
          </Card>
        ) : (
          renderCard(active)
        )}
      </section>

      {library.length > 0 || !system.isActive ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold">Библиотека</h2>
            <p className="text-muted-foreground text-sm">
              Сохранённые рубрики вашей команды.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {!system.isActive ? (
              <Card className="gap-4">
                <CardHeader>
                  <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/40">
                    <IconSparkles className="size-4" />
                  </div>
                  <CardTitle>{system.name}</CardTitle>
                  <CardDescription className="min-h-10">
                    {system.description}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto justify-between border-t pt-4">
                  <span className="text-muted-foreground text-xs">
                    {system.criteriaCount} сигналов
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendingId === "system"}
                    onClick={() => activate("system")}
                  >
                    Активировать
                  </Button>
                </CardFooter>
              </Card>
            ) : null}
            {library.map(renderCard)}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Добавить Scorecard</h2>
          <p className="text-muted-foreground text-sm">
            Начните с готовой методической основы или соберите свою.
          </p>
        </div>
        <div className="grid overflow-hidden rounded-xl border sm:grid-cols-2 xl:grid-cols-5">
          {initialTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="group flex min-h-44 flex-col border-b p-5 text-left transition-colors hover:bg-muted/40 sm:border-r xl:border-b-0"
              onClick={() => openEditor(draftFromTemplate(template))}
            >
              <IconTargetArrow className="size-5" />
              <span className="mt-6 font-medium">{template.name}</span>
              <span className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                {template.description}
              </span>
              <span className="text-muted-foreground mt-auto flex items-center gap-1 pt-4 text-xs">
                {criteriaCount(template.categories)} критериев{" "}
                <IconChevronRight className="size-3" />
              </span>
            </button>
          ))}
          <button
            type="button"
            className="group flex min-h-44 flex-col p-5 text-left transition-colors hover:bg-muted/40"
            onClick={() => openEditor(blankDraft())}
          >
            <IconPlus className="size-5" />
            <span className="mt-6 font-medium">С чистого листа</span>
            <span className="text-muted-foreground mt-1 text-xs leading-5">
              Своя структура, веса и формулировки.
            </span>
            <span className="text-muted-foreground mt-auto flex items-center gap-1 pt-4 text-xs">
              Создать <IconChevronRight className="size-3" />
            </span>
          </button>
        </div>
      </section>

      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Создать Scorecard</DialogTitle>
            <DialogDescription>
              Выберите методическую основу. Всё можно изменить перед
              сохранением.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {initialTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/40"
                onClick={() => openEditor(draftFromTemplate(template))}
              >
                <span className="font-medium">{template.name}</span>
                <span className="text-muted-foreground mt-1 block text-xs leading-5">
                  {template.description}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="rounded-xl border border-dashed p-4 text-left transition-colors hover:bg-muted/40"
              onClick={() => openEditor(blankDraft())}
            >
              <span className="font-medium">С чистого листа</span>
              <span className="text-muted-foreground mt-1 block text-xs">
                Полностью своя рубрика.
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {editorOpen ? (
        <ScorecardEditor
          key={`${editing?.id ?? "new"}-${editorOpen}`}
          open={editorOpen}
          scorecard={editing}
          initialDraft={editorDraft}
          onOpenChange={setEditorOpen}
          onSaved={handleSaved}
        />
      ) : null}

      <AlertDialog
        open={Boolean(archiving)}
        onOpenChange={(open) => !open && setArchiving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Переместить Scorecard в архив?</AlertDialogTitle>
            <AlertDialogDescription>
              Рубрика «{archiving?.name}» исчезнет из библиотеки. Завершённые
              сессии сохранят её снимок и результаты.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingId === archiving?.id}
              onClick={archiveScorecard}
            >
              В архив
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
