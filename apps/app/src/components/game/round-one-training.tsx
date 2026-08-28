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
  IconCheck,
  IconRefresh,
  IconSchool,
  IconUser,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { client } from "~/orpc/react";

const LEVELS = [
  { id: "L1", label: "L1 — не умеет и не уверен" },
  { id: "L2", label: "L2 — учится, нужна поддержка" },
  { id: "L3", label: "L3 — умеет, но не всегда уверен" },
  { id: "L4", label: "L4 — умеет и берёт ответственность" },
] as const;

const STYLES = [
  { id: "directive", label: "Директивный" },
  { id: "coaching", label: "Наставнический" },
  { id: "supporting", label: "Поддерживающий" },
  { id: "delegating", label: "Делегирующий" },
] as const;

const CASES = [
  {
    id: "timur",
    name: "Тимур",
    role: "Стажёр",
    description:
      "Впервые вышел на кухню, ждёт подробных инструкций и боится сообщать об ошибках.",
    answer: "L1",
    styleId: "directive",
    style: "Директивный",
  },
  {
    id: "marina",
    name: "Марина",
    role: "Помощник повара",
    description:
      "Уже знает базовые операции, но путается в граммовках и нуждается в объяснении и поддержке.",
    answer: "L2",
    styleId: "coaching",
    style: "Наставнический",
  },
  {
    id: "igor",
    name: "Игорь",
    role: "Повар горячего цеха",
    description:
      "Уверенно готовит знакомые блюда, но теряет темп при нескольких заказах и сомневается в приоритетах.",
    answer: "L3",
    styleId: "supporting",
    style: "Поддерживающий",
  },
  {
    id: "anna",
    name: "Анна",
    role: "Повар десертов",
    description:
      "Самостоятельно отвечает за привычную выпечку, контролирует качество и не нуждается в постоянном надзоре.",
    answer: "L4",
    styleId: "delegating",
    style: "Делегирующий",
  },
] as const;

export function RoundOneTraining() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const completedTracked = useRef(false);

  const score = useMemo(
    () => Object.values(results).filter(Boolean).length,
    [results],
  );
  const item = CASES[currentIndex] ?? CASES[0];
  const currentComplete = Boolean(
    answers[`${item.id}:level`] && answers[`${item.id}:style`],
  );
  const checked = Object.hasOwn(results, item.id);
  const finished = Object.keys(results).length === CASES.length;

  useEffect(() => {
    void client.game.activity
      .track({ name: "warmup_started", properties: {} })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!finished || completedTracked.current) return;
    completedTracked.current = true;
    void client.game.activity
      .track({
        name: "warmup_completed",
        properties: { score, total: CASES.length },
      })
      .catch(() => undefined);
  }, [finished, score]);

  function reset() {
    setAnswers({});
    setResults({});
    setCurrentIndex(0);
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-5">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconSchool className="size-4" />
            Разминка по стилям руководства
          </CardTitle>
          <CardDescription className="mt-1">
            Последовательно пройдите четыре ситуации учебного пути.
          </CardDescription>
        </div>
        <CardAction className="flex items-center gap-3 sm:justify-end">
          <span className="text-muted-foreground text-xs tabular-nums">
            {Object.keys(results).length} из {CASES.length} пройдено
          </span>
          <Badge variant="outline">{score} верно</Badge>
        </CardAction>
      </CardHeader>
      <Progress
        value={(Object.keys(results).length / CASES.length) * 100}
        className="h-1 rounded-none border-0"
      />

      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-b p-3 lg:min-h-[560px] lg:border-b-0 lg:border-r">
            <p className="text-muted-foreground px-3 pb-2 text-xs font-medium uppercase tracking-wide">
              Этапы пути
            </p>
            <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {CASES.map((caseItem, index) => {
                const result = results[caseItem.id];
                const active = index === currentIndex;
                return (
                  <button
                    key={caseItem.id}
                    type="button"
                    aria-current={active ? "step" : undefined}
                    onClick={() => setCurrentIndex(index)}
                    className={`flex min-w-52 items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors lg:min-w-0 ${
                      active ? "bg-muted" : "hover:bg-muted/60"
                    }`}
                  >
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                        result === true
                          ? "border-primary bg-primary text-primary-foreground"
                          : result === false
                            ? "border-destructive text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      {result === true ? (
                        <IconCheck className="size-4" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {caseItem.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {caseItem.role}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" className="mt-3" onClick={reset}>
              <IconRefresh data-icon="inline-start" />
              Начать заново
            </Button>
          </aside>

          <div className="flex flex-col gap-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="bg-muted flex size-11 items-center justify-center rounded-lg">
                  <IconUser className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{item.name}</h2>
                  <p className="text-muted-foreground text-sm">{item.role}</p>
                </div>
              </div>
              <Badge variant="outline">
                Ситуация {currentIndex + 1} из {CASES.length}
              </Badge>
            </div>

            <p className="max-w-3xl text-base leading-7">{item.description}</p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">1. Уровень готовности</p>
                <Select
                  value={answers[`${item.id}:level`] ?? ""}
                  onValueChange={(value) => {
                    setAnswers({
                      ...answers,
                      [`${item.id}:level`]: value ?? "",
                    });
                    setResults((current) => {
                      const next = { ...current };
                      delete next[item.id];
                      return next;
                    });
                  }}
                >
                  <SelectTrigger aria-label={`Уровень сотрудника ${item.name}`}>
                    <SelectValue placeholder="Выберите уровень" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {LEVELS.map((level) => (
                        <SelectItem key={level.id} value={level.id}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">2. Стиль руководства</p>
                <Select
                  value={answers[`${item.id}:style`] ?? ""}
                  onValueChange={(value) => {
                    setAnswers({
                      ...answers,
                      [`${item.id}:style`]: value ?? "",
                    });
                    setResults((current) => {
                      const next = { ...current };
                      delete next[item.id];
                      return next;
                    });
                  }}
                >
                  <SelectTrigger
                    aria-label={`Стиль руководства для ${item.name}`}
                  >
                    <SelectValue placeholder="Выберите стиль" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {STYLES.map((style) => (
                        <SelectItem key={style.id} value={style.id}>
                          {style.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {checked ? (
              <Alert>
                <IconCheck />
                <AlertTitle>
                  Правильная связка: {item.answer} · {item.style}
                </AlertTitle>
                <AlertDescription>
                  {results[item.id]
                    ? "Оценка готовности и выбранный стиль совпали."
                    : "Сравните связку со своим ответом: готовность оценивается именно к конкретной задаче."}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-5">
              {currentIndex > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => setCurrentIndex(currentIndex - 1)}
                >
                  Назад
                </Button>
              ) : null}
              {!checked ? (
                <Button
                  disabled={!currentComplete}
                  onClick={() =>
                    setResults({
                      ...results,
                      [item.id]:
                        answers[`${item.id}:level`] === item.answer &&
                        answers[`${item.id}:style`] === item.styleId,
                    })
                  }
                >
                  Проверить ответ
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              ) : currentIndex < CASES.length - 1 ? (
                <Button onClick={() => setCurrentIndex(currentIndex + 1)}>
                  Следующая ситуация
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              ) : null}
              {finished ? (
                <Badge variant="secondary" className="ml-auto">
                  Путь завершён: {score} из {CASES.length}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
