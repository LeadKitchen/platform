"use client";

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui";
import {
  IconArrowRight,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { EvaluationCard, type EvaluationView } from "./evaluation-card";

interface ScriptTurn {
  role: "manager" | "employee";
  text: string;
  /** Что именно демонстрирует эта реплика — показывается под ней в демо. */
  note?: string;
}

const EMPLOYEE = { name: "Марина Ким", role: "Помощник повара · уровень L2" };
const TASK_TITLE = "Салаты дня, 15 порций";

const SCRIPT: ScriptTurn[] = [
  {
    role: "manager",
    text: "Марина, у нас новый заказ: салаты дня, 15 порций к обеду.",
    note: "Обратился по имени и сразу назвал задачу — сотрудник включается в разговор.",
  },
  {
    role: "employee",
    text: "Хорошо, базовый рецепт я помню, но на такой объём сомневаюсь в пропорциях соуса.",
  },
  {
    role: "manager",
    text: "Ориентир такой: соус к овощам 1 к 5. Сделай одну пробную порцию и покажи мне перед тем, как готовить остальные.",
    note: "Дал чёткий ориентир и назначил контрольную точку — это наставнический стиль, а не просто приказ.",
  },
  {
    role: "employee",
    text: "Поняла, соберу пробную порцию и подойду на проверку.",
  },
  {
    role: "manager",
    text: "Отлично. Если по заправке будут вопросы — сразу спрашивай, не жди, пока накопится.",
    note: "Явно предложил поддержку, но не забрал задачу себе — ответственность остаётся у сотрудника.",
  },
  {
    role: "employee",
    text: "Спасибо, тогда приступаю — через 20 минут покажу первую порцию.",
  },
];

const DEMO_EVALUATION: EvaluationView = {
  scorePercent: 88,
  expectedStyle: "coaching",
  actualStyle: "coaching",
  styleDistribution: {
    directive: 0.1,
    coaching: 0.75,
    supporting: 0.15,
    delegating: 0,
  },
  criteria: [
    { id: "greeted", title: "Обратился к сотруднику по имени", met: true },
    {
      id: "result",
      title: "Обозначил ожидаемый результат и срок",
      met: true,
    },
    { id: "checked", title: "Проверил понимание задачи", met: true },
    { id: "checkpoint", title: "Назначил контрольную точку", met: true },
    { id: "tone", title: "Сохранил уважительный тон", met: true },
    {
      id: "support",
      title: "Уточнил, что именно вызывает сомнения",
      met: false,
      comment: "Можно было спросить прямо, а не только предложить обращаться",
    },
  ],
  outcome: {
    status: "success",
    onTime: true,
    defects: [],
    motivationDelta: 1,
    summary:
      "Марина сделала пробную порцию, сверила пропорции и уложилась в срок — заказ ушёл без замечаний.",
  },
  breakdown: { style: 40, actions: 30, outcome: 18, penalties: 0 },
  summary:
    "Ориентир и контрольная точка совпали с готовностью Марины (L2): дали структуру, но оставили пространство для вопросов.",
};

const SPEED_OPTIONS = [
  { id: "1", label: "1×", ms: 2600 },
  { id: "1.5", label: "1.5×", ms: 1800 },
  { id: "2", label: "2×", ms: 1200 },
] as const;

/**
 * Автопроигрывающийся пример разговора, чтобы новый игрок увидел исход до
 * того, как начнёт настоящую смену. Использует ту же карточку разбора
 * (`EvaluationCard`), что и реальный диалог, — итог демо выглядит так же,
 * как итог настоящей игры.
 */
export function DemoTour() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedId, setSpeedId] =
    useState<(typeof SPEED_OPTIONS)[number]["id"]>("1");
  const endRef = useRef<HTMLDivElement>(null);

  const finished = visibleCount >= SCRIPT.length;
  const speed =
    SPEED_OPTIONS.find((option) => option.id === speedId) ?? SPEED_OPTIONS[0];

  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleCount нужен в зависимостях, чтобы таймер переставлялся после каждой реплики, хотя в теле эффекта не читается.
  useEffect(() => {
    if (!playing || finished) return;
    const timer = window.setTimeout(() => {
      setVisibleCount((count) => Math.min(count + 1, SCRIPT.length));
    }, speed.ms);
    return () => window.clearTimeout(timer);
  }, [playing, finished, speed.ms, visibleCount]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: должен переисполняться при каждой новой реплике.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visibleCount]);

  function restart() {
    setVisibleCount(0);
    setPlaying(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback>
                  {EMPLOYEE.name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{EMPLOYEE.name}</CardTitle>
                <CardDescription>{EMPLOYEE.role}</CardDescription>
              </div>
            </div>
            <Badge variant="secondary">
              <IconSparkles data-icon="inline-start" />
              Демо-запись
            </Badge>
          </div>
          <CardDescription>Ситуация: {TASK_TITLE}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Progress value={(visibleCount / SCRIPT.length) * 100} />

          <div className="flex min-h-[280px] flex-col gap-3 rounded-lg border p-4">
            {SCRIPT.slice(0, visibleCount).map((turn, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: сценарий фиксирован и только раскрывается по порядку.
                key={index}
                className={
                  turn.role === "manager"
                    ? "ml-auto max-w-[92%] sm:max-w-[80%]"
                    : "mr-auto max-w-[92%] sm:max-w-[80%]"
                }
              >
                <div
                  className={
                    turn.role === "manager"
                      ? "bg-primary/10 rounded-lg px-3 py-2"
                      : "bg-muted rounded-lg px-3 py-2"
                  }
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarFallback>
                        {turn.role === "manager"
                          ? "ВЫ"
                          : EMPLOYEE.name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-muted-foreground text-xs">
                      {turn.role === "manager" ? "Вы" : EMPLOYEE.name}
                    </p>
                  </div>
                  <p className="text-sm">{turn.text}</p>
                </div>
                {turn.note ? (
                  <p className="text-muted-foreground mt-1 px-1 text-xs italic">
                    {turn.note}
                  </p>
                ) : null}
              </div>
            ))}

            {!finished && visibleCount > 0 ? (
              <div
                aria-live="polite"
                className="bg-muted mr-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              >
                <span className="flex gap-1">
                  <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
                  <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
                  <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full" />
                </span>
              </div>
            ) : null}

            {visibleCount === 0 ? (
              <p className="text-muted-foreground m-auto text-sm">
                Нажмите «Смотреть», чтобы запустить пример разговора.
              </p>
            ) : null}

            <div ref={endRef} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {finished ? (
              <Button onClick={restart}>
                <IconRefresh data-icon="inline-start" />
                Смотреть ещё раз
              </Button>
            ) : (
              <Button onClick={() => setPlaying((current) => !current)}>
                {playing ? (
                  <IconPlayerPause data-icon="inline-start" />
                ) : (
                  <IconPlayerPlay data-icon="inline-start" />
                )}
                {playing ? "Пауза" : "Смотреть"}
              </Button>
            )}

            <Select
              value={speedId}
              onValueChange={(value) =>
                setSpeedId(value as (typeof SPEED_OPTIONS)[number]["id"])
              }
            >
              <SelectTrigger
                aria-label="Скорость воспроизведения"
                className="w-24"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {SPEED_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <span className="text-muted-foreground text-xs">
              {visibleCount} из {SCRIPT.length} реплик
            </span>

            {!finished && visibleCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setVisibleCount(SCRIPT.length)}
              >
                Пропустить
                <IconArrowRight data-icon="inline-end" />
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {finished ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Так выглядит разбор после разговора — с тем же процентом и
            чек-листом, что увидит реальный игрок:
          </p>
          <EvaluationCard evaluation={DEMO_EVALUATION} />
        </div>
      ) : null}
    </div>
  );
}
