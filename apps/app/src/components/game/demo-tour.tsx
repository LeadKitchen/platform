"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@acme/ui";
import {
  IconArrowRight,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { employeeAvatarUri, userAvatarUri } from "~/lib/avatar";
import {
  DEFAULT_DEMO_SCENARIO_ID,
  DEMO_SCENARIO_GROUPS,
  DEMO_SCENARIOS,
  type DemoScenario,
  type DemoScenarioGroup,
  resolveDemoScenario,
} from "./demo-scenarios";
import { EvaluationCard } from "./evaluation-card";

const SPEED_OPTIONS = [
  { id: "1", label: "1×", ms: 2600 },
  { id: "1.5", label: "1.5×", ms: 1800 },
  { id: "2", label: "2×", ms: 1200 },
] as const;

type SpeedId = (typeof SPEED_OPTIONS)[number]["id"];

const SCENARIO_QUERY_PARAM = "scenario";

/**
 * Определяем группу текущего сценария — нужно, чтобы верхний ряд табов
 * подсвечивал правильную вкладку при загрузке по deep-link.
 */
function groupOfScenario(scenario: DemoScenario): DemoScenarioGroup {
  return scenario.group;
}

/**
 * Автопроигрыватель демо-разговоров с переключателем сценариев.
 *
 * Сценарий хранится в query-параметре `?scenario=…`, чтобы конкретный кейс
 * можно было дать ссылкой (например, ведущему на разбор ошибки). При смене
 * таба состояние проигрывателя (позиция, пауза) сбрасывается, скорость —
 * сохраняется.
 */
export function DemoTour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const scenarioIdFromUrl = searchParams.get(SCENARIO_QUERY_PARAM);
  const scenario = useMemo(
    () => resolveDemoScenario(scenarioIdFromUrl),
    [scenarioIdFromUrl],
  );

  const activeGroup = groupOfScenario(scenario);
  const employeeAvatar = employeeAvatarUri(scenario.employee.name);
  const managerAvatar = userAvatarUri("demo-manager");

  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedId, setSpeedId] = useState<SpeedId>("1");
  const endRef = useRef<HTMLDivElement>(null);

  const script = scenario.script;
  const finished = visibleCount >= script.length;
  const speed =
    SPEED_OPTIONS.find((option) => option.id === speedId) ?? SPEED_OPTIONS[0];

  // biome-ignore lint/correctness/useExhaustiveDependencies: сценарий нужен как триггер сброса, хотя в теле используются только setters.
  useEffect(() => {
    setVisibleCount(0);
    setPlaying(true);
  }, [scenario.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleCount нужен в зависимостях, чтобы таймер переставлялся после каждой реплики, хотя в теле эффекта не читается.
  useEffect(() => {
    if (!playing || finished) return;
    const timer = window.setTimeout(() => {
      setVisibleCount((count) => Math.min(count + 1, script.length));
    }, speed.ms);
    return () => window.clearTimeout(timer);
  }, [playing, finished, speed.ms, visibleCount, script.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: должен переисполняться при каждой новой реплике.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visibleCount]);

  const setScenarioId = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams);
      if (id === DEFAULT_DEMO_SCENARIO_ID) {
        params.delete(SCENARIO_QUERY_PARAM);
      } else {
        params.set(SCENARIO_QUERY_PARAM, id);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  function restart() {
    setVisibleCount(0);
    setPlaying(true);
  }

  function handleGroupChange(next: string) {
    const group = next as DemoScenarioGroup;
    if (group === activeGroup) return;
    const firstInGroup = DEMO_SCENARIOS.find((item) => item.group === group);
    if (firstInGroup) setScenarioId(firstInGroup.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <ScenarioPicker
        activeGroup={activeGroup}
        activeScenarioId={scenario.id}
        onGroupChange={handleGroupChange}
        onScenarioChange={setScenarioId}
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarImage
                  src={employeeAvatar}
                  alt={scenario.employee.name}
                />
                <AvatarFallback>{scenario.employee.initials}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{scenario.employee.name}</CardTitle>
                <CardDescription>{scenario.employee.role}</CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{scenario.levelBadge}</Badge>
              {scenario.shift.round === 3 ? (
                <Badge variant="outline">Раунд 3</Badge>
              ) : null}
              {scenario.shift.soloOnShift ? (
                <Badge variant="outline">Один в смене</Badge>
              ) : null}
              <Badge variant="secondary">
                <IconSparkles data-icon="inline-start" />
                Демо-запись
              </Badge>
            </div>
          </div>
          <CardDescription>Ситуация: {scenario.taskTitle}</CardDescription>
          <p className="text-muted-foreground text-sm">{scenario.headline}</p>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <p className="bg-muted/40 rounded-lg p-3 text-sm">{scenario.intro}</p>

          <Progress value={(visibleCount / script.length) * 100} />

          <div className="flex min-h-[280px] flex-col gap-3 rounded-lg border p-4">
            {script.slice(0, visibleCount).map((turn, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: сценарий фиксирован и только раскрывается по порядку.
                key={`${scenario.id}-${index}`}
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
                      <AvatarImage
                        src={
                          turn.role === "manager"
                            ? managerAvatar
                            : employeeAvatar
                        }
                        alt={
                          turn.role === "manager"
                            ? "Вы"
                            : scenario.employee.name
                        }
                      />
                      <AvatarFallback>
                        {turn.role === "manager"
                          ? "ВЫ"
                          : scenario.employee.initials}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-muted-foreground text-xs">
                      {turn.role === "manager" ? "Вы" : scenario.employee.name}
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
              onValueChange={(value) => setSpeedId(value as SpeedId)}
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
              {visibleCount} из {script.length} реплик
            </span>

            {!finished && visibleCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setVisibleCount(script.length)}
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
          <EvaluationCard evaluation={scenario.evaluation} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Двухуровневый переключатель: верхний ряд — группы (правильно / ошибки /
 * раунд 3), нижний ряд — сценарии внутри выбранной группы. Внутри `mistakes`
 * получается 4 таба в одном ряду, поэтому список делаем прокручиваемым по
 * горизонтали на узких экранах.
 */
function ScenarioPicker({
  activeGroup,
  activeScenarioId,
  onGroupChange,
  onScenarioChange,
}: {
  activeGroup: DemoScenarioGroup;
  activeScenarioId: string;
  onGroupChange: (next: string) => void;
  onScenarioChange: (next: string) => void;
}) {
  const groupDescription = DEMO_SCENARIO_GROUPS.find(
    (group) => group.id === activeGroup,
  )?.description;

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={activeGroup} onValueChange={onGroupChange}>
        <TabsList className="w-full sm:w-fit">
          {DEMO_SCENARIO_GROUPS.map((group) => (
            <TabsTrigger key={group.id} value={group.id}>
              {group.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {DEMO_SCENARIO_GROUPS.map((group) => (
          <TabsContent key={group.id} value={group.id} className="mt-0" />
        ))}
      </Tabs>

      {groupDescription ? (
        <p className="text-muted-foreground text-sm">{groupDescription}</p>
      ) : null}

      <Tabs value={activeScenarioId} onValueChange={onScenarioChange}>
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            {DEMO_SCENARIOS.filter((item) => item.group === activeGroup).map(
              (item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.tabLabel}
                </TabsTrigger>
              ),
            )}
          </TabsList>
        </div>
      </Tabs>
    </div>
  );
}
