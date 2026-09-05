"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Progress,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@acme/ui";
import {
  IconAlertTriangle,
  IconBrain,
  IconCheck,
  IconFlask,
  IconPlayerPlay,
  IconRocket,
  IconShieldCheck,
  IconSparkles,
  IconUsersPlus,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

type DraftResult = Awaited<
  ReturnType<typeof client.admin.game.characters.draftRoster>
>;
type SimulationResult = Awaited<
  ReturnType<typeof client.admin.game.characters.simulateRoster>
>;
type SimulationMode = "standard" | "peak" | "conflict";

const EXAMPLES = [
  "Создай команду открытия нового ресторана: сильный, но резкий су-шеф; тревожный новичок и опытный кондитер, который не любит микроменеджмент.",
  "Нужны персонажи для пикового часа: каждый по-разному реагирует на конфликт приоритетов, поддержку и жёсткий дедлайн.",
  "Собери контрастную смену для обучения управляющих: сотрудник после повышения, уверенный эксперт и талантливый стажёр, который боится переспросить.",
] as const;

const COMPETENCE_LABELS: Record<string, string> = {
  novice: "новичок",
  learning: "учится",
  capable: "самостоятелен",
  expert: "эксперт",
};

const SIMULATION_MODES: ReadonlyArray<{
  value: SimulationMode;
  label: string;
}> = [
  { value: "standard", label: "Обычная смена" },
  { value: "peak", label: "Час пик" },
  { value: "conflict", label: "Конфликт" },
];

const DEFAULT_SCENARIO =
  "Во время пиковой загрузки важный заказ задерживается на 15 минут. Руководитель резко меняет приоритет и просит сотрудника немедленно переключиться.";

function scoreBadge(score: number) {
  if (score >= 90) return "Готов к игре";
  if (score >= 80) return "Прошёл проверку";
  return "Нужно улучшить";
}

export function AdminCharacterStudio(props: {
  taskTypes: Array<{ type: string; title: string }>;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState("3");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [simulationScenario, setSimulationScenario] =
    useState(DEFAULT_SCENARIO);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>("peak");
  const [simulationPending, setSimulationPending] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const busy = pending || simulationPending;

  async function generate() {
    if (busy || brief.trim().length < 20) return;
    setPending(true);
    try {
      const draft = await client.admin.game.characters.draftRoster({
        brief: brief.trim(),
        count: Number(count),
      });
      setResult(draft);
      setSimulation(null);
      toast.success("Набор создан и проверен автоматически");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось создать набор",
      );
    } finally {
      setPending(false);
    }
  }

  async function simulate() {
    if (
      !result ||
      pending ||
      simulationPending ||
      simulationScenario.trim().length < 20
    ) {
      return;
    }
    setSimulationPending(true);
    try {
      const simulated = await client.admin.game.characters.simulateRoster({
        scenario: simulationScenario.trim(),
        mode: simulationMode,
        draft: result.draft,
      });
      setSimulation(simulated);
      if (simulated.quality.ready) {
        toast.success("Все персонажи прошли сценарную проверку");
      } else {
        toast.warning("Симуляция нашла персонажей, которых стоит доработать");
      }
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось запустить симуляцию",
      );
    } finally {
      setSimulationPending(false);
    }
  }

  async function publish() {
    if (!result?.quality.ready || busy) return;
    setPending(true);
    try {
      const published = await client.admin.game.characters.publishRoster({
        brief: brief.trim(),
        requestedCount: result.meta.requestedCount,
        baseRevision: result.baseRevision,
        draft: result.draft,
      });
      toast.success(`Опубликовано персонажей: ${published.createdIds.length}`);
      setResult(null);
      setBrief("");
      router.push("/admin/game/employees");
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось опубликовать",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg">
              <IconFlask />
            </div>
            <div>
              <CardTitle>Лаборатория персонажей</CardTitle>
              <CardDescription>
                Пакетная генерация игровых ролей из бизнес-брифа с
                автоматическим quality gate и пробными репликами.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-3 md:grid-cols-4">
            {(
              [
                ["1", "Бриф", "Цели и контекст заказчика"],
                ["2", "LLM-дизайн", "Геном поведения и навыков"],
                ["3", "Quality gate", "8 автоматических проверок"],
                ["4", "Публикация", "Одна транзакция и audit trail"],
              ] as const
            ).map(([step, title, description]) => (
              <Card key={step}>
                <CardHeader>
                  <CardAction>
                    <Badge variant="outline">{step}</Badge>
                  </CardAction>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="character-brief">
                Какая команда нужна для игры?
              </FieldLabel>
              <Textarea
                id="character-brief"
                rows={5}
                value={brief}
                disabled={busy}
                aria-invalid={brief.length > 0 && brief.trim().length < 20}
                onChange={(event) => {
                  setBrief(event.target.value);
                  setResult(null);
                  setSimulation(null);
                }}
                placeholder="Опишите роли, рабочую среду, типичные конфликты, уровень сложности и поведение, которое важно потренировать…"
              />
              <FieldDescription>
                Технические JSON-поля заполнятся автоматически. Вы проверяете
                поведение на понятных карточках.
              </FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-end">
              <Field>
                <FieldLabel htmlFor="character-count">
                  Персонажей в наборе
                </FieldLabel>
                <Select
                  value={count}
                  disabled={busy}
                  onValueChange={(value) => {
                    setCount(value ?? "3");
                    setResult(null);
                    setSimulation(null);
                  }}
                >
                  <SelectTrigger id="character-count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button
                className="justify-self-start"
                size="lg"
                disabled={busy || brief.trim().length < 20}
                onClick={generate}
              >
                <IconSparkles data-icon="inline-start" />
                {pending ? "Проектируем и проверяем…" : "Создать набор"}
              </Button>
            </div>
          </FieldGroup>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <Button
                key={example}
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBrief(example);
                  setResult(null);
                  setSimulation(null);
                }}
              >
                {example}
              </Button>
            ))}
          </div>

          <Alert>
            <IconUsersPlus />
            <AlertTitle>Масштабирование без разработки</AlertTitle>
            <AlertDescription>
              Текущая игра поддерживает типы задач:{" "}
              {[...new Set(props.taskTypes.map((task) => task.type))].join(
                ", ",
              ) || "пока не настроены"}
              . Лаборатория автоматически связывает с ними компетенции новых
              персонажей.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {result ? (
        <>
          <Card>
            <CardHeader>
              <CardAction>
                <Badge variant={result.quality.ready ? "default" : "secondary"}>
                  {scoreBadge(result.quality.score)}
                </Badge>
              </CardAction>
              <CardTitle>{result.draft.teamName}</CardTitle>
              <CardDescription>{result.draft.summary}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">Качество набора</span>
                <span className="text-muted-foreground tabular-nums">
                  {result.quality.score}% · {result.meta.model} ·{" "}
                  {(result.meta.latencyMs / 1000).toFixed(1)} с
                </span>
              </div>
              <Progress value={result.quality.score} />
              {result.draft.warnings.length > 0 ? (
                <Alert>
                  <IconAlertTriangle />
                  <AlertTitle>Что важно проверить</AlertTitle>
                  <AlertDescription>
                    <ul className="flex list-disc flex-col gap-1 pl-4">
                      {result.draft.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              {result.quality.blockers.length > 0 ? (
                <Alert variant="destructive">
                  <IconAlertTriangle />
                  <AlertTitle>Публикация пока заблокирована</AlertTitle>
                  <AlertDescription>
                    {result.quality.blockers.join(" ")}
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardAction>
                {simulation ? (
                  <Badge
                    variant={simulation.quality.ready ? "default" : "secondary"}
                  >
                    {simulation.quality.score}%
                  </Badge>
                ) : (
                  <Badge variant="outline">A/B-проверка</Badge>
                )}
              </CardAction>
              <CardTitle>Сценарный полигон</CardTitle>
              <CardDescription>
                Запустите всех персонажей в одном эпизоде и сравните реакции до
                публикации. Отдельный LLM-судья проверит качество ответов.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Alert>
                <IconBrain />
                <AlertTitle>Два изолированных контура</AlertTitle>
                <AlertDescription>
                  Генератор играет роли, затем второй вызов получает только
                  профили и готовые ответы. Финальный взвешенный балл
                  рассчитывает сервер, включая независимую защиту от выхода из
                  роли.
                </AlertDescription>
              </Alert>

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="simulation-scenario">
                    Контрольный игровой эпизод
                  </FieldLabel>
                  <Textarea
                    id="simulation-scenario"
                    rows={4}
                    value={simulationScenario}
                    disabled={busy}
                    aria-invalid={simulationScenario.trim().length < 20}
                    onChange={(event) => {
                      setSimulationScenario(event.target.value);
                      setSimulation(null);
                    }}
                  />
                  <FieldDescription>
                    Один и тот же контекст используется для всех персонажей —
                    различия в ответах объясняются их профилями.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Режим нагрузки</FieldLabel>
                  <ToggleGroup
                    aria-label="Режим нагрузки симуляции"
                    variant="outline"
                    value={[simulationMode]}
                    disabled={busy}
                    onValueChange={(values) => {
                      const nextMode = values[0] as SimulationMode | undefined;
                      if (!nextMode) return;
                      setSimulationMode(nextMode);
                      setSimulation(null);
                    }}
                  >
                    {SIMULATION_MODES.map((mode) => (
                      <ToggleGroupItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button
                size="lg"
                disabled={busy || simulationScenario.trim().length < 20}
                onClick={simulate}
              >
                <IconPlayerPlay data-icon="inline-start" />
                {simulationPending
                  ? "Персонажи отвечают, судья проверяет…"
                  : simulation
                    ? "Повторить симуляцию"
                    : "Запустить всех персонажей"}
              </Button>
            </CardFooter>
          </Card>

          {simulation ? (
            <Card>
              <CardHeader>
                <CardAction>
                  <Badge
                    variant={simulation.quality.ready ? "default" : "secondary"}
                  >
                    {simulation.quality.ready
                      ? "Симуляция пройдена"
                      : "Нужна доработка"}
                  </Badge>
                </CardAction>
                <CardTitle>Результат сценарного прогона</CardTitle>
                <CardDescription>{simulation.judgeSummary}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Alert>
                  <IconPlayerPlay />
                  <AlertTitle>
                    Как модель поняла эпизод ·{" "}
                    {
                      SIMULATION_MODES.find(
                        (mode) => mode.value === simulationMode,
                      )?.label
                    }
                  </AlertTitle>
                  <AlertDescription>{simulation.scenario}</AlertDescription>
                </Alert>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">Средний балл команды</span>
                  <span className="text-muted-foreground tabular-nums">
                    {simulation.quality.score}% ·{" "}
                    {(simulation.meta.latencyMs / 1000).toFixed(1)} с ·{" "}
                    {simulation.meta.inputTokens + simulation.meta.outputTokens}{" "}
                    токенов
                  </span>
                </div>
                <Progress value={simulation.quality.score} />

                {simulation.quality.blockers.length > 0 ? (
                  <Alert variant="destructive">
                    <IconAlertTriangle />
                    <AlertTitle>Обнаружены блокирующие риски</AlertTitle>
                    <AlertDescription>
                      <ul className="flex list-disc flex-col gap-1 pl-4">
                        {simulation.quality.blockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  {simulation.responses.map((response) => {
                    const character = result.draft.characters.find(
                      (item) => item.profile.id === response.characterId,
                    );
                    const quality = simulation.quality.characters.find(
                      (item) => item.characterId === response.characterId,
                    );
                    return (
                      <Card key={response.characterId}>
                        <CardHeader>
                          <CardAction>
                            <Badge
                              variant={quality?.ready ? "default" : "secondary"}
                            >
                              {quality?.score ?? 0}%
                            </Badge>
                          </CardAction>
                          <CardTitle>
                            {character?.profile.name ?? response.characterId}
                          </CardTitle>
                          <CardDescription>
                            {character?.profile.role ?? "Неизвестная роль"} ·{" "}
                            {response.emotion}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                          <p className="bg-muted/40 rounded-lg p-3 text-sm leading-relaxed">
                            «{response.reply}»
                          </p>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-muted-foreground text-xs">
                                Скрытая потребность
                              </p>
                              <p className="text-sm">{response.inferredNeed}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">
                                Поведенческий риск
                              </p>
                              <p className="text-sm">
                                {response.behavioralRisk}
                              </p>
                            </div>
                          </div>

                          <Separator />
                          <div className="grid gap-3 sm:grid-cols-2">
                            {quality?.metrics.map((metric) => (
                              <div
                                key={metric.id}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <span>{metric.label}</span>
                                <Badge variant="outline">
                                  {metric.score}% · {metric.weight}%
                                </Badge>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <IconShieldCheck className="text-muted-foreground" />
                            <div className="flex flex-col gap-1">
                              <p>{quality?.evidence}</p>
                              <p className="text-muted-foreground">
                                {quality?.recommendation}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <p className="text-muted-foreground text-xs">
                  Генератор: {simulation.meta.generatorModel} · судья:{" "}
                  {simulation.meta.judgeModel}. Результат симуляции не изменяет
                  каталог и безопасен для повторных прогонов.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-2">
            {result.draft.characters.map((character, index) => {
              const quality = result.quality.characters[index];
              const personality = character.profile.personality;
              return (
                <Card key={character.profile.id}>
                  <CardHeader>
                    <CardAction>
                      <Badge variant={quality?.ready ? "default" : "secondary"}>
                        {quality?.score ?? 0}%
                      </Badge>
                    </CardAction>
                    <CardTitle>{character.profile.name}</CardTitle>
                    <CardDescription>
                      {character.profile.role} · {character.profile.level} ·{" "}
                      <code>{character.profile.id}</code>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <p className="text-sm leading-relaxed">
                      {character.designIntent}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {Object.entries(character.profile.competences).map(
                        ([type, competence]) => (
                          <Badge key={type} variant="outline">
                            {type}:{" "}
                            {COMPETENCE_LABELS[competence] ?? competence}
                          </Badge>
                        ),
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Мотивирует
                        </p>
                        <p className="text-sm">
                          {personality.motivators.join(", ")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Под нагрузкой
                        </p>
                        <p className="text-sm">{personality.stressBehavior}</p>
                      </div>
                    </div>

                    <Tabs defaultValue="normal">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="normal">Обычно</TabsTrigger>
                        <TabsTrigger value="pressure">Давление</TabsTrigger>
                        <TabsTrigger value="support">Поддержка</TabsTrigger>
                      </TabsList>
                      <TabsContent value="normal">
                        <p className="bg-muted/40 rounded-lg p-3 text-sm">
                          «{character.preview.normal}»
                        </p>
                      </TabsContent>
                      <TabsContent value="pressure">
                        <p className="bg-muted/40 rounded-lg p-3 text-sm">
                          «{character.preview.underPressure}»
                        </p>
                      </TabsContent>
                      <TabsContent value="support">
                        <p className="bg-muted/40 rounded-lg p-3 text-sm">
                          «{character.preview.afterSupport}»
                        </p>
                      </TabsContent>
                    </Tabs>

                    <Separator />
                    <div className="flex flex-col gap-2">
                      {quality?.checks.map((check) => (
                        <div
                          key={check.id}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            {check.passed ? (
                              <IconCheck className="text-muted-foreground" />
                            ) : (
                              <IconAlertTriangle className="text-muted-foreground" />
                            )}
                            {check.label}
                          </span>
                          <Badge variant="outline">
                            {check.passed ? `+${check.weight}` : "0"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Готово к публикации</CardTitle>
              <CardDescription>
                Все персонажи сохранятся одновременно, а предыдущую конфигурацию
                можно будет восстановить из истории версий.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled={busy || !result.quality.ready}
                onClick={publish}
              >
                <IconRocket data-icon="inline-start" />
                {pending ? "Публикуем…" : "Опубликовать весь набор"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setResult(null);
                  setSimulation(null);
                }}
              >
                Создать другой вариант
              </Button>
            </CardFooter>
          </Card>
        </>
      ) : null}
    </div>
  );
}
