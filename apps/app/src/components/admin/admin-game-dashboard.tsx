"use client";

import type {
  CompetenceState,
  EmployeePersonality,
  ManagementStyle,
} from "@acme/game";
import { STYLE_LABELS } from "@acme/game/styles";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@acme/ui";
import {
  IconDatabase,
  IconDeviceFloppy,
  IconMessageCircle,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { VariantComparison, type VariantStats } from "~/components/game";
import { client } from "~/orpc/react";
import { AdminAiAssistant } from "./admin-ai-assistant";
import { AdminAnalyticsAssistant } from "./admin-analytics-assistant";
import {
  AdminBenchmarkReports,
  type BenchmarkRun,
} from "./admin-benchmark-reports";
import { AdminCharacterStudio } from "./admin-character-studio";
import { AdminConfigHistory } from "./admin-config-history";
import { AdminReviewReports, type ReviewReport } from "./admin-review-reports";

interface Employee {
  id: string;
  name: string;
  role: string;
  level: string;
  gender: "male" | "female";
  competences: Record<string, string>;
  personality: Record<string, unknown>;
  isActive: boolean;
}

interface GameTask {
  id: string;
  title: string;
  type: string;
  complexity: number;
  timeCriticality: number;
  requiresCheckpoints: boolean;
  failureModes: string[];
  isActive: boolean;
}

interface Variant {
  id: string;
  name: string;
  description: string;
  engagement: string;
  knowledge: string;
  persona: string;
  evaluation: string;
  model: string | null;
  effort: string | null;
  params: Record<string, unknown>;
  isActive: boolean;
  weight: number;
}

interface Strategy {
  id: string;
  name?: string;
  description?: string;
}

interface GameSettings {
  defaultVariantId: string | null;
  defaultRound: 2 | 3;
  defaultDeadlineMinutes: number;
  allowRoundThree: boolean;
  maxActiveSessions: number;
}

export type AdminGameSection =
  | "overview"
  | "sessions"
  | "dialogs"
  | "employees"
  | "characters"
  | "tasks"
  | "variants"
  | "benchmarks"
  | "reviews"
  | "comparisons"
  | "organizations"
  | "users"
  | "settings";

const SECTION_COPY: Record<
  AdminGameSection,
  { title: string; description: string }
> = {
  overview: {
    title: "Обзор",
    description: "Ключевые показатели игры и сравнение подходов ИИ.",
  },
  sessions: {
    title: "Игровые сессии",
    description: "Запуски игры, заказы, диалоги и их текущие статусы.",
  },
  dialogs: {
    title: "Диалоги и оценки",
    description: "История разговоров и результаты управленческих решений.",
  },
  employees: {
    title: "Сотрудники",
    description: "Персонажи, компетенции и профили поведения в игре.",
  },
  characters: {
    title: "Лаборатория персонажей",
    description:
      "Пакетное LLM-проектирование, синтетические прогоны и автоматический контроль качества.",
  },
  tasks: {
    title: "Задания",
    description: "Игровые заказы, сложность, срочность и риски.",
  },
  variants: {
    title: "Варианты ИИ",
    description:
      "Технологии AI-конвейера: включайте нужные и выбирайте, какая из них работает в новых сессиях.",
  },
  benchmarks: {
    title: "Отчёты о качестве",
    description: "Офлайн-замеры подходов на размеченных сценариях.",
  },
  reviews: {
    title: "Ревью старого проекта",
    description:
      "Технический разбор прежней реализации (sitruk_review) и рекомендации на основе архитектуры Sitruk.",
  },
  comparisons: {
    title: "Сравнение с новым проектом",
    description:
      "Прямое сопоставление прежней реализации и архитектуры Sitruk: недостатки, найденные при живой проверке, и что их устраняет.",
  },
  organizations: {
    title: "Организации",
    description: "Компании-заказчики, их участники и ведущие деловой игры.",
  },
  users: {
    title: "Пользователи",
    description: "Участники приложения и доступ к администрированию.",
  },
  settings: {
    title: "Настройки игры",
    description: "Системная конфигурация и значения для новых сессий.",
  },
};

const DIALOGS_PAGE_SIZE = 100;

interface SessionRow {
  session: {
    id: string;
    title: string;
    round: number;
    variantId: string | null;
    status: string;
    createdAt: Date | string;
  };
  variantName: string | null;
  orders: number;
  dialogs: number;
}

interface DialogRow {
  dialog: {
    id: string;
    round: number;
    variantId: string;
    status: string;
    startedAt: Date | string;
  };
  evaluation: null | {
    scorePercent: number;
    expectedStyle: string;
    actualStyle: string;
  };
  sessionTitle: string;
  employeeName: string;
  taskTitle: string;
}

export interface AdminGameData {
  analytics: { dialogs: number; variants: VariantStats[] };
  productAnalytics: {
    events: number;
    counts: Record<string, number>;
    uniqueUsers: Record<string, number>;
    dialogCompletionRate: number;
    voiceAdoptionRate: number;
    replayRate: number;
  };
  dialogs: DialogRow[];
  variants: {
    variants: Variant[];
    strategies: {
      engagement: Strategy[];
      knowledge: Strategy[];
      persona: Strategy[];
      evaluation: Strategy[];
    };
  };
  catalog: { employees: Employee[]; tasks: GameTask[] };
  sessions: SessionRow[];
  system: {
    counts: Record<string, number>;
    runtime: {
      provider: string;
      model: string;
      defaultVariant: string;
      databaseDriver: string;
      adminEmails: string[];
      appEnvironment: string;
    };
    settings: GameSettings;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    username: string | null;
    emailVerified: boolean;
    createdAt: Date | string;
    isAdmin: boolean;
    isBootstrapAdmin: boolean;
    orgId: string | null;
    orgName: string | null;
    isFacilitator: boolean;
  }>;
  organizations: Array<{
    id: string;
    name: string;
    createdAt: Date | string;
    members: number;
    facilitators: number;
  }>;
  benchmarks: BenchmarkRun[];
  reviews: ReviewReport[];
  comparisons: ReviewReport[];
}

const emptyEmployee: Employee = {
  id: "",
  name: "",
  role: "",
  level: "L2",
  gender: "female",
  competences: {},
  personality: {
    tone: "confident",
    reactionToDirective: "neutral",
    reactionToSupport: "neutral",
    typicalErrors: ["поздно сообщает о риске"],
    motivators: ["понятный результат"],
    demotivators: ["противоречивые указания"],
  },
  isActive: true,
};

const emptyTask: GameTask = {
  id: "",
  title: "",
  type: "",
  complexity: 2,
  timeCriticality: 2,
  requiresCheckpoints: false,
  failureModes: [],
  isActive: true,
};

const emptyVariant: Variant = {
  id: "",
  name: "",
  description: "",
  engagement: "heuristic",
  knowledge: "prompt-baseline",
  persona: "prompt-baseline",
  evaluation: "rules",
  model: null,
  effort: null,
  params: {},
  isActive: true,
  weight: 1,
};

function styleLabel(style: string): string {
  return STYLE_LABELS[style as ManagementStyle] ?? style;
}

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  return (
    { active: "Идёт", completed: "Завершена", archived: "В архиве" }[status] ??
    status
  );
}

function parseObject(value: string, field: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${field}: нужен корректный JSON-объект`);
  }
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number | string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {description}
      </CardContent>
    </Card>
  );
}

export function AdminGameDashboard({
  initialData,
  section = "overview",
}: {
  initialData: AdminGameData;
  section?: AdminGameSection;
}) {
  const router = useRouter();
  const [employees, setEmployees] = useState(initialData.catalog.employees);
  const [tasks, setTasks] = useState(initialData.catalog.tasks);
  const [variants, setVariants] = useState(initialData.variants.variants);
  const [sessions, setSessions] = useState(initialData.sessions);
  const [users, setUsers] = useState(initialData.users);
  const [userQuery, setUserQuery] = useState("");
  const [dialogQuery, setDialogQuery] = useState("");
  const [dialogs, setDialogs] = useState(initialData.dialogs);
  const [dialogsHasMore, setDialogsHasMore] = useState(
    initialData.dialogs.length === DIALOGS_PAGE_SIZE,
  );
  const [dialogsLoading, setDialogsLoading] = useState(false);
  const [dialogsLoadingMore, setDialogsLoadingMore] = useState(false);
  const dialogRequestId = useRef(0);
  const didMountDialogs = useRef(false);
  const [organizations, setOrganizations] = useState(initialData.organizations);
  const [newOrgName, setNewOrgName] = useState("");
  const [settings, setSettings] = useState<GameSettings>(
    initialData.system.settings,
  );
  const [employee, setEmployee] = useState<Employee>(emptyEmployee);
  const [employeeCompetences, setEmployeeCompetences] = useState("{}");
  const [employeePersonality, setEmployeePersonality] = useState("{}");
  const [task, setTask] = useState<GameTask>(emptyTask);
  const [taskFailureModes, setTaskFailureModes] = useState("");
  const [variant, setVariant] = useState<Variant>(emptyVariant);
  const [variantParams, setVariantParams] = useState("{}");
  const [pending, setPending] = useState(false);

  const completedSessions = useMemo(
    () => sessions.filter((item) => item.session.status === "completed").length,
    [sessions],
  );
  const liveVariantId =
    settings.defaultVariantId ?? initialData.system.runtime.defaultVariant;
  const visibleUsers = useMemo(() => {
    const query = userQuery.trim().toLocaleLowerCase("ru");
    if (!query) return users;
    return users.filter((item) =>
      [item.name, item.email, item.username ?? ""].some((value) =>
        value.toLocaleLowerCase("ru").includes(query),
      ),
    );
  }, [userQuery, users]);

  useEffect(() => {
    if (!didMountDialogs.current) {
      didMountDialogs.current = true;
      return;
    }

    const requestId = ++dialogRequestId.current;
    const query = dialogQuery.trim();
    setDialogsLoading(true);
    setDialogsLoadingMore(false);
    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await client.admin.game.dialogs({
          query: query || undefined,
          limit: DIALOGS_PAGE_SIZE,
          offset: 0,
        });
        if (requestId !== dialogRequestId.current) return;
        setDialogs(result);
        setDialogsHasMore(result.length === DIALOGS_PAGE_SIZE);
      } catch (cause) {
        if (requestId !== dialogRequestId.current) return;
        toast.error(
          cause instanceof Error ? cause.message : "Ошибка загрузки диалогов",
        );
      } finally {
        if (requestId === dialogRequestId.current) setDialogsLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [dialogQuery]);

  async function loadMoreDialogs() {
    const requestId = ++dialogRequestId.current;
    setDialogsLoadingMore(true);
    try {
      const result = await client.admin.game.dialogs({
        query: dialogQuery.trim() || undefined,
        limit: DIALOGS_PAGE_SIZE,
        offset: dialogs.length,
      });
      if (requestId !== dialogRequestId.current) return;
      setDialogs((current) => [...current, ...result]);
      setDialogsHasMore(result.length === DIALOGS_PAGE_SIZE);
    } catch (cause) {
      if (requestId !== dialogRequestId.current) return;
      toast.error(
        cause instanceof Error ? cause.message : "Ошибка загрузки диалогов",
      );
    } finally {
      if (requestId === dialogRequestId.current) setDialogsLoadingMore(false);
    }
  }

  function chooseEmployee(id: string | null) {
    const selected = employees.find((item) => item.id === id) ?? emptyEmployee;
    setEmployee({ ...selected });
    setEmployeeCompetences(JSON.stringify(selected.competences, null, 2));
    setEmployeePersonality(JSON.stringify(selected.personality, null, 2));
  }

  function chooseTask(id: string | null) {
    const selected = tasks.find((item) => item.id === id) ?? emptyTask;
    setTask({ ...selected });
    setTaskFailureModes(selected.failureModes.join("\n"));
  }

  function chooseVariant(id: string | null) {
    const selected = variants.find((item) => item.id === id) ?? emptyVariant;
    setVariant({ ...selected });
    setVariantParams(JSON.stringify(selected.params, null, 2));
  }

  async function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await client.admin.game.catalog.upsertEmployee({
        ...employee,
        level: employee.level as "L1" | "L2" | "L3" | "L4",
        gender: employee.gender,
        competences: parseObject(employeeCompetences, "Компетенции") as Record<
          string,
          CompetenceState
        >,
        personality: parseObject(
          employeePersonality,
          "Профиль личности",
        ) as unknown as EmployeePersonality,
      });
      setEmployees((current) =>
        [...current.filter((item) => item.id !== saved.id), saved].sort(
          (a, b) => a.name.localeCompare(b.name, "ru"),
        ),
      );
      toast.success("Сотрудник сохранён");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка сохранения");
    } finally {
      setPending(false);
    }
  }

  async function saveTask(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await client.admin.game.catalog.upsertTask({
        ...task,
        failureModes: taskFailureModes
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setTasks((current) =>
        [...current.filter((item) => item.id !== saved.id), saved].sort(
          (a, b) => a.title.localeCompare(b.title, "ru"),
        ),
      );
      toast.success("Задание сохранено");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка сохранения");
    } finally {
      setPending(false);
    }
  }

  async function saveVariant(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await client.admin.game.variants.upsert({
        ...variant,
        effort: (variant.effort || undefined) as
          | "low"
          | "medium"
          | "high"
          | "xhigh"
          | "max"
          | undefined,
        model: variant.model || undefined,
        params: parseObject(variantParams, "Параметры"),
      });
      if (!saved) throw new Error("API не вернул сохранённый вариант");
      setVariants((current) =>
        [...current.filter((item) => item.id !== saved.id), saved].sort(
          (a, b) => a.id.localeCompare(b.id),
        ),
      );
      toast.success("Вариант ИИ сохранён");
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка сохранения");
    } finally {
      setPending(false);
    }
  }

  async function toggleVariantActive(id: string, isActive: boolean) {
    setPending(true);
    try {
      const saved = await client.admin.game.variants.setActive({
        id,
        isActive,
      });
      setVariants((current) =>
        current.map((item) => (item.id === id ? saved : item)),
      );
      if (variant.id === id) setVariant((current) => ({ ...current, isActive }));
      toast.success(isActive ? "Вариант включён" : "Вариант выключен");
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка обновления");
    } finally {
      setPending(false);
    }
  }

  async function makeVariantDefault(id: string) {
    setPending(true);
    try {
      const saved = await client.admin.game.system.updateSettings({
        ...settings,
        defaultVariantId: id,
      });
      if (!saved) throw new Error("API не вернул сохранённые настройки");
      setSettings({
        defaultVariantId: saved.defaultVariantId,
        defaultRound: saved.defaultRound === 3 ? 3 : 2,
        defaultDeadlineMinutes: saved.defaultDeadlineMinutes,
        allowRoundThree: saved.allowRoundThree,
        maxActiveSessions: saved.maxActiveSessions,
      });
      toast.success("Этот вариант теперь работает в новых сессиях");
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка обновления");
    } finally {
      setPending(false);
    }
  }

  async function updateSessionStatus(id: string, status: string | null) {
    if (!status) return;
    try {
      const saved = await client.admin.game.sessions.setStatus({
        id,
        status: status as "active" | "completed" | "archived",
      });
      setSessions((current) =>
        current.map((item) =>
          item.session.id === id ? { ...item, session: saved } : item,
        ),
      );
      toast.success("Статус сессии обновлён");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка обновления");
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await client.admin.game.system.updateSettings(settings);
      if (!saved) throw new Error("API не вернул сохранённые настройки");
      setSettings({
        defaultVariantId: saved.defaultVariantId,
        defaultRound: saved.defaultRound === 3 ? 3 : 2,
        defaultDeadlineMinutes: saved.defaultDeadlineMinutes,
        allowRoundThree: saved.allowRoundThree,
        maxActiveSessions: saved.maxActiveSessions,
      });
      toast.success("Игровые настройки сохранены");
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка сохранения");
    } finally {
      setPending(false);
    }
  }

  async function updateAdmin(userId: string, isAdmin: boolean) {
    setPending(true);
    try {
      await client.admin.users.setAdmin({ userId, isAdmin });
      setUsers((current) =>
        current.map((item) =>
          item.id === userId ? { ...item, isAdmin } : item,
        ),
      );
      toast.success(
        isAdmin ? "Администратор назначен" : "Права администратора отозваны",
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка обновления");
    } finally {
      setPending(false);
    }
  }

  async function createOrganization() {
    const name = newOrgName.trim();
    if (!name) return;
    setPending(true);
    try {
      const org = await client.admin.game.organizations.create({ name });
      setOrganizations((current) =>
        [...current, { ...org, members: 0, facilitators: 0 }].sort((a, b) =>
          a.name.localeCompare(b.name, "ru"),
        ),
      );
      setNewOrgName("");
      toast.success("Организация создана");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка создания");
    } finally {
      setPending(false);
    }
  }

  async function updateUserOrg(userId: string, orgId: string | null) {
    setPending(true);
    try {
      await client.admin.game.organizations.setMember({ userId, orgId });
      const org = orgId
        ? (organizations.find((item) => item.id === orgId) ?? null)
        : null;
      setUsers((current) =>
        current.map((item) =>
          item.id === userId
            ? {
                ...item,
                orgId,
                orgName: org?.name ?? null,
                isFacilitator: orgId ? item.isFacilitator : false,
              }
            : item,
        ),
      );
      toast.success(orgId ? "Организация назначена" : "Организация снята");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка обновления");
    } finally {
      setPending(false);
    }
  }

  async function updateFacilitator(
    userId: string,
    orgId: string,
    isFacilitator: boolean,
  ) {
    setPending(true);
    try {
      await client.admin.game.organizations.setFacilitator({
        userId,
        orgId,
        isFacilitator,
      });
      setUsers((current) =>
        current.map((item) =>
          item.id === userId ? { ...item, isFacilitator } : item,
        ),
      );
      toast.success(
        isFacilitator ? "Назначен ведущим группы" : "Права ведущего отозваны",
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка обновления");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Администрирование</p>
          <h1 className="text-3xl font-medium tracking-[-0.035em]">
            {SECTION_COPY[section].title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {SECTION_COPY[section].description}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.refresh()}>
          <IconRefresh data-icon="inline-start" />
          Обновить данные
        </Button>
      </div>

      {section === "overview" || section === "settings" ? (
        <>
          <AdminAiAssistant />
          <AdminConfigHistory />
        </>
      ) : null}

      {section === "overview" ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Сессии"
              value={initialData.system.counts.sessions ?? 0}
              description={`${completedSessions} завершено`}
            />
            <StatCard
              title="Диалоги"
              value={initialData.system.counts.dialogs ?? 0}
              description={`${initialData.system.counts.evaluations ?? 0} с оценкой`}
            />
            <StatCard
              title="Участники"
              value={users.length}
              description="Зарегистрировано в приложении"
            />
            <StatCard
              title="Варианты ИИ"
              value={variants.length}
              description={`${variants.filter((item) => item.isActive).length} включено`}
            />
          </div>
          <VariantComparison variants={initialData.analytics.variants} />
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Завершают разговор"
              value={`${Math.round(initialData.productAnalytics.dialogCompletionRate * 100)}%`}
              description="От пользователей, начавших диалог"
            />
            <StatCard
              title="Используют голос"
              value={`${Math.round(initialData.productAnalytics.voiceAdoptionRate * 100)}%`}
              description="Доля участников диалогов"
            />
            <StatCard
              title="Повторяют ситуацию"
              value={`${Math.round(initialData.productAnalytics.replayRate * 100)}%`}
              description="От завершивших разговор"
            />
          </div>
          <AdminAnalyticsAssistant />
        </div>
      ) : null}

      {section === "sessions" ? (
        <div>
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Игровые сессии</CardTitle>
              <CardDescription>
                Все запуски игры, количество заказов и диалогов.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Раунд</TableHead>
                    <TableHead>Вариант</TableHead>
                    <TableHead>Заказы</TableHead>
                    <TableHead>Диалоги</TableHead>
                    <TableHead>Создана</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((row) => (
                    <TableRow key={row.session.id}>
                      <TableCell className="font-medium">
                        <Link
                          className="hover:underline"
                          href={`/game/${row.session.id}`}
                        >
                          {row.session.title}
                        </Link>
                      </TableCell>
                      <TableCell>{row.session.round}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {row.session.variantId ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.orders}</TableCell>
                      <TableCell>{row.dialogs}</TableCell>
                      <TableCell>{dateLabel(row.session.createdAt)}</TableCell>
                      <TableCell>
                        <Select
                          value={row.session.status}
                          onValueChange={(value) =>
                            updateSessionStatus(row.session.id, value)
                          }
                        >
                          <SelectTrigger size="sm">
                            <SelectValue>
                              {statusLabel(row.session.status)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="active">Идёт</SelectItem>
                              <SelectItem value="completed">
                                Завершена
                              </SelectItem>
                              <SelectItem value="archived">В архиве</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "dialogs" ? (
        <div className="bg-card grid min-h-[620px] overflow-hidden rounded-xl border xl:grid-cols-[380px_1fr]">
          <div className="flex min-h-0 flex-col border-b xl:border-r xl:border-b-0">
            <div className="border-b p-3">
              <div className="relative">
                <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={dialogQuery}
                  onChange={(event) => setDialogQuery(event.target.value)}
                  placeholder="Поиск разговоров"
                  aria-label="Поиск разговоров"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
              <span className="font-medium">Загруженные разговоры</span>
              <Badge variant="secondary">{dialogs.length}</Badge>
            </div>
            <div className="max-h-[540px] flex-1 overflow-y-auto">
              {dialogsLoading ? (
                <div className="text-muted-foreground flex min-h-56 items-center justify-center p-6 text-sm">
                  Загрузка…
                </div>
              ) : dialogs.length === 0 ? (
                <div className="text-muted-foreground flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
                  <IconMessageCircle className="size-6" />
                  Ничего не найдено
                </div>
              ) : (
                dialogs.map((row) => (
                  <Link
                    key={row.dialog.id}
                    href={`/admin/game/dialogs/${row.dialog.id}`}
                    className="hover:bg-muted/50 flex flex-col gap-2 border-b p-4 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {row.sessionTitle}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {row.employeeName} · {row.taskTitle}
                        </p>
                      </div>
                      {row.evaluation ? (
                        <Badge>{row.evaluation.scorePercent}%</Badge>
                      ) : (
                        <Badge variant="outline">Без оценки</Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                      <span>
                        {row.evaluation
                          ? `${styleLabel(row.evaluation.expectedStyle)} → ${styleLabel(row.evaluation.actualStyle)}`
                          : row.dialog.variantId}
                      </span>
                      <span>{dateLabel(row.dialog.startedAt)}</span>
                    </div>
                  </Link>
                ))
              )}
              {dialogsHasMore && !dialogsLoading ? (
                <div className="border-t p-3">
                  <Button
                    className="w-full"
                    type="button"
                    variant="outline"
                    disabled={dialogsLoadingMore}
                    onClick={loadMoreDialogs}
                  >
                    {dialogsLoadingMore ? "Загрузка…" : "Показать ещё"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="text-muted-foreground flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full">
              <IconMessageCircle className="size-5" />
            </div>
            <div>
              <p className="text-foreground font-medium">Выберите разговор</p>
              <p className="mt-1 max-w-sm text-sm">
                Откройте запись из списка, чтобы увидеть хронологию, стиль и
                итоговую оценку.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {section === "employees" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-5">
              <CardTitle>Каталог сотрудников</CardTitle>
              <CardDescription>
                {employees.length} профилей персонажей.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {employees.map((item) => (
                <Button
                  variant="outline"
                  type="button"
                  key={item.id}
                  onClick={() => chooseEmployee(item.id)}
                  className={`h-auto min-h-28 items-start justify-between gap-3 rounded-xl p-4 text-left shadow-none transition-colors ${
                    employee.id === item.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-foreground/20 hover:bg-muted/40"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {item.name}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-sm font-normal whitespace-normal">
                      {item.role} · {item.level}
                    </span>
                  </span>
                  <Badge variant={item.isActive ? "default" : "secondary"}>
                    {item.isActive ? "Активен" : "Скрыт"}
                  </Badge>
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-5">
              <CardTitle>
                {employee.id ? "Редактирование сотрудника" : "Новый сотрудник"}
              </CardTitle>
              <CardDescription>
                Компетенции и профиль личности задаются JSON-объектами.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-5">
              <form onSubmit={saveEmployee}>
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="employee-id">ID</FieldLabel>
                      <Input
                        id="employee-id"
                        value={employee.id}
                        disabled={employees.some(
                          (item) => item.id === employee.id,
                        )}
                        onChange={(event) =>
                          setEmployee({ ...employee, id: event.target.value })
                        }
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="employee-level">Уровень</FieldLabel>
                      <Select
                        value={employee.level}
                        onValueChange={(value) =>
                          setEmployee({ ...employee, level: value ?? "L2" })
                        }
                      >
                        <SelectTrigger id="employee-level">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {["L1", "L2", "L3", "L4"].map((level) => (
                              <SelectItem key={level} value={level}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="employee-gender">
                        Голос (пол)
                      </FieldLabel>
                      <Select
                        value={employee.gender}
                        onValueChange={(value) =>
                          setEmployee({
                            ...employee,
                            gender: value === "male" ? "male" : "female",
                          })
                        }
                      >
                        <SelectTrigger id="employee-gender">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="female">Женский</SelectItem>
                            <SelectItem value="male">Мужской</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="employee-name">Имя</FieldLabel>
                    <Input
                      id="employee-name"
                      value={employee.name}
                      onChange={(event) =>
                        setEmployee({ ...employee, name: event.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="employee-role">Роль</FieldLabel>
                    <Input
                      id="employee-role"
                      value={employee.role}
                      onChange={(event) =>
                        setEmployee({ ...employee, role: event.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="employee-competences">
                      Компетенции
                    </FieldLabel>
                    <Textarea
                      id="employee-competences"
                      rows={6}
                      value={employeeCompetences}
                      onChange={(event) =>
                        setEmployeeCompetences(event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="employee-personality">
                      Профиль личности
                    </FieldLabel>
                    <Textarea
                      id="employee-personality"
                      rows={6}
                      value={employeePersonality}
                      onChange={(event) =>
                        setEmployeePersonality(event.target.value)
                      }
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="employee-active">
                      Доступен в игре
                    </FieldLabel>
                    <Switch
                      id="employee-active"
                      checked={employee.isActive}
                      onCheckedChange={(checked) =>
                        setEmployee({ ...employee, isActive: checked })
                      }
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={pending}>
                      <IconDeviceFloppy data-icon="inline-start" />
                      Сохранить
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => chooseEmployee(null)}
                    >
                      Новый
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "characters" ? (
        <AdminCharacterStudio
          taskTypes={tasks.map((task) => ({
            type: task.type,
            title: task.title,
          }))}
        />
      ) : null}

      {section === "tasks" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-5">
              <CardTitle>Каталог заданий</CardTitle>
              <CardDescription>{tasks.length} игровых заказов.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {tasks.map((item) => (
                <Button
                  variant="outline"
                  type="button"
                  key={item.id}
                  onClick={() => chooseTask(item.id)}
                  className={`h-auto min-h-28 items-start justify-between gap-3 rounded-xl p-4 text-left shadow-none transition-colors ${
                    task.id === item.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-foreground/20 hover:bg-muted/40"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium whitespace-normal">
                      {item.title}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-sm font-normal whitespace-normal">
                      {item.type} · сложность {item.complexity}/5
                    </span>
                  </span>
                  <Badge variant={item.isActive ? "default" : "secondary"}>
                    {item.isActive ? "Активно" : "Скрыто"}
                  </Badge>
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-5">
              <CardTitle>
                {task.id ? "Редактирование задания" : "Новое задание"}
              </CardTitle>
              <CardDescription>
                Параметры определяют ожидаемый стиль руководства и результат
                заказа.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-5">
              <form onSubmit={saveTask}>
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="task-id">ID</FieldLabel>
                      <Input
                        id="task-id"
                        value={task.id}
                        disabled={tasks.some((item) => item.id === task.id)}
                        onChange={(event) =>
                          setTask({ ...task, id: event.target.value })
                        }
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-type">Тип</FieldLabel>
                      <Input
                        id="task-type"
                        value={task.type}
                        onChange={(event) =>
                          setTask({ ...task, type: event.target.value })
                        }
                        required
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="task-title">Название</FieldLabel>
                    <Input
                      id="task-title"
                      value={task.title}
                      onChange={(event) =>
                        setTask({ ...task, title: event.target.value })
                      }
                      required
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="task-complexity">
                        Сложность, 1–5
                      </FieldLabel>
                      <Input
                        id="task-complexity"
                        type="number"
                        min={1}
                        max={5}
                        value={task.complexity}
                        onChange={(event) =>
                          setTask({
                            ...task,
                            complexity: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-criticality">
                        Срочность, 1–5
                      </FieldLabel>
                      <Input
                        id="task-criticality"
                        type="number"
                        min={1}
                        max={5}
                        value={task.timeCriticality}
                        onChange={(event) =>
                          setTask({
                            ...task,
                            timeCriticality: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="task-failures">
                      Риски, по одному на строку
                    </FieldLabel>
                    <Textarea
                      id="task-failures"
                      rows={6}
                      value={taskFailureModes}
                      onChange={(event) =>
                        setTaskFailureModes(event.target.value)
                      }
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="task-checkpoints">
                      Нужны точки контроля
                    </FieldLabel>
                    <Switch
                      id="task-checkpoints"
                      checked={task.requiresCheckpoints}
                      onCheckedChange={(checked) =>
                        setTask({ ...task, requiresCheckpoints: checked })
                      }
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="task-active">
                      Доступно в игре
                    </FieldLabel>
                    <Switch
                      id="task-active"
                      checked={task.isActive}
                      onCheckedChange={(checked) =>
                        setTask({ ...task, isActive: checked })
                      }
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={pending}>
                      <IconDeviceFloppy data-icon="inline-start" />
                      Сохранить
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => chooseTask(null)}
                    >
                      Новое
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "variants" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-5">
              <CardTitle>Варианты AI-конвейера</CardTitle>
              <CardDescription>
                Технологии, доступные новым игровым сессиям. «Работает в
                игре» — вариант, который реально запускается у команд прямо
                сейчас; выбор всегда явный, без случайного распределения.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 py-5">
              {variants.map((item) => {
                const isLive = item.id === liveVariantId;
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-start sm:justify-between ${
                      variant.id === item.id
                        ? "border-primary bg-primary/5"
                        : "hover:border-foreground/20 hover:bg-muted/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => chooseVariant(item.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block font-medium">{item.name}</span>
                      <span className="text-muted-foreground mt-1 block text-sm font-normal whitespace-normal">
                        {item.knowledge} · {item.persona} · {item.evaluation}
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      {isLive ? <Badge>Работает в игре</Badge> : null}
                      <Badge variant={item.isActive ? "default" : "secondary"}>
                        {item.isActive ? "Включён" : "Выключен"}
                      </Badge>
                      <Switch
                        aria-label={
                          item.isActive
                            ? `Выключить «${item.name}»`
                            : `Включить «${item.name}»`
                        }
                        checked={item.isActive}
                        disabled={pending}
                        onCheckedChange={(checked) =>
                          toggleVariantActive(item.id, checked)
                        }
                      />
                      {!isLive ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending || !item.isActive}
                          title={
                            item.isActive
                              ? "Сделать вариантом, который работает в новых сессиях"
                              : "Сначала включите вариант"
                          }
                          onClick={() => makeVariantDefault(item.id)}
                        >
                          Сделать активным
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-5">
              <CardTitle>
                {variant.id ? "Настройка варианта" : "Новый вариант"}
              </CardTitle>
              <CardDescription>
                Изменения применяются только к новым диалогам.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-5">
              <form onSubmit={saveVariant}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="variant-id">ID</FieldLabel>
                    <Input
                      id="variant-id"
                      value={variant.id}
                      disabled={variants.some((item) => item.id === variant.id)}
                      onChange={(event) =>
                        setVariant({ ...variant, id: event.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="variant-name">Название</FieldLabel>
                    <Input
                      id="variant-name"
                      value={variant.name}
                      onChange={(event) =>
                        setVariant({ ...variant, name: event.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="variant-description">
                      Описание
                    </FieldLabel>
                    <Textarea
                      id="variant-description"
                      value={variant.description}
                      onChange={(event) =>
                        setVariant({
                          ...variant,
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  {(
                    [
                      "engagement",
                      "knowledge",
                      "persona",
                      "evaluation",
                    ] as const
                  ).map((kind) => (
                    <Field key={kind}>
                      <FieldLabel htmlFor={`variant-${kind}`}>
                        {kind}
                      </FieldLabel>
                      <Select
                        value={variant[kind]}
                        onValueChange={(value) =>
                          setVariant({
                            ...variant,
                            [kind]: value ?? variant[kind],
                          })
                        }
                      >
                        <SelectTrigger id={`variant-${kind}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {initialData.variants.strategies[kind].map(
                              (strategy) => (
                                <SelectItem
                                  key={strategy.id}
                                  value={strategy.id}
                                >
                                  {strategy.name ?? strategy.id}
                                </SelectItem>
                              ),
                            )}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  ))}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="variant-model">Модель</FieldLabel>
                      <Input
                        id="variant-model"
                        value={variant.model ?? ""}
                        placeholder="По умолчанию"
                        onChange={(event) =>
                          setVariant({ ...variant, model: event.target.value })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="variant-effort">Усилие</FieldLabel>
                      <Select
                        value={variant.effort ?? "default"}
                        onValueChange={(value) =>
                          setVariant({
                            ...variant,
                            effort: value === "default" ? null : value,
                          })
                        }
                      >
                        <SelectTrigger id="variant-effort">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="default">
                              По умолчанию
                            </SelectItem>
                            {["low", "medium", "high", "xhigh", "max"].map(
                              (effort) => (
                                <SelectItem key={effort} value={effort}>
                                  {effort}
                                </SelectItem>
                              ),
                            )}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="variant-params">
                      Параметры JSON
                    </FieldLabel>
                    <Textarea
                      id="variant-params"
                      rows={7}
                      value={variantParams}
                      onChange={(event) => setVariantParams(event.target.value)}
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="variant-active">
                      Доступен новым сессиям
                    </FieldLabel>
                    <Switch
                      id="variant-active"
                      checked={variant.isActive}
                      onCheckedChange={(checked) =>
                        setVariant({ ...variant, isActive: checked })
                      }
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={pending}>
                      <IconDeviceFloppy data-icon="inline-start" />
                      Сохранить
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => chooseVariant(null)}
                    >
                      Новый
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "benchmarks" ? (
        <AdminBenchmarkReports runs={initialData.benchmarks} />
      ) : null}

      {section === "reviews" ? (
        <AdminReviewReports
          reports={initialData.reviews}
          title={SECTION_COPY.reviews.title}
          description={SECTION_COPY.reviews.description}
          publishKind="legacy-review"
        />
      ) : null}

      {section === "comparisons" ? (
        <AdminReviewReports
          reports={initialData.comparisons}
          title={SECTION_COPY.comparisons.title}
          description={SECTION_COPY.comparisons.description}
          publishKind="comparison"
        />
      ) : null}

      {section === "settings" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconDatabase />
                Системная конфигурация
              </CardTitle>
              <CardDescription>
                Активные настройки процесса без отображения секретов.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Окружение</span>
                <Badge variant="outline">
                  {initialData.system.runtime.appEnvironment}
                </Badge>
              </div>
              <Separator />
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">AI-провайдер</span>
                <span className="font-medium">
                  {initialData.system.runtime.provider}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Модель</span>
                <span className="font-medium">
                  {initialData.system.runtime.model}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Fallback-вариант ИИ
                </span>
                <span className="font-medium">
                  {initialData.system.runtime.defaultVariant}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Драйвер БД</span>
                <span className="font-medium">
                  {initialData.system.runtime.databaseDriver}
                </span>
              </div>
              <FieldDescription>
                Провайдер, модель, драйвер и fallback задаются переменными
                окружения. Игровой вариант по умолчанию можно переопределить
                справа.
              </FieldDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Игровые настройки</CardTitle>
              <CardDescription>
                Применяются к новым сессиям и заказам сразу после сохранения.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveSettings}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="settings-default-variant">
                      Вариант ИИ по умолчанию
                    </FieldLabel>
                    <Select
                      value={settings.defaultVariantId ?? "__automatic"}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          defaultVariantId:
                            value === "__automatic" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger id="settings-default-variant">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__automatic">
                            {`Fallback из переменной окружения (${initialData.system.runtime.defaultVariant})`}
                          </SelectItem>
                          {variants
                            .filter((item) => item.isActive)
                            .map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Всегда один конкретный вариант, без случайного
                      распределения между сессиями. Тот же выбор доступен
                      кнопкой «Сделать активным» в разделе «Варианты ИИ».
                    </FieldDescription>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="settings-default-round">
                        Раунд по умолчанию
                      </FieldLabel>
                      <Select
                        value={String(settings.defaultRound)}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            defaultRound: value === "3" ? 3 : 2,
                          })
                        }
                      >
                        <SelectTrigger id="settings-default-round">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="2">Раунд 2</SelectItem>
                            {settings.allowRoundThree ? (
                              <SelectItem value="3">Раунд 3</SelectItem>
                            ) : null}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="settings-deadline">
                        Дедлайн заказа, мин
                      </FieldLabel>
                      <Input
                        id="settings-deadline"
                        type="number"
                        min={5}
                        max={600}
                        value={settings.defaultDeadlineMinutes}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            defaultDeadlineMinutes: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="settings-max-sessions">
                      Максимум активных сессий
                    </FieldLabel>
                    <Input
                      id="settings-max-sessions"
                      type="number"
                      min={1}
                      max={100}
                      value={settings.maxActiveSessions}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          maxActiveSessions: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="settings-round-three">
                      Разрешить третий раунд
                    </FieldLabel>
                    <Switch
                      id="settings-round-three"
                      checked={settings.allowRoundThree}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          allowRoundThree: checked,
                          defaultRound:
                            !checked && settings.defaultRound === 3
                              ? 2
                              : settings.defaultRound,
                        })
                      }
                    />
                  </Field>
                  <Button type="submit" disabled={pending}>
                    <IconDeviceFloppy data-icon="inline-start" />
                    Сохранить настройки
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "users" ? (
        <Card>
          <CardHeader>
            <CardTitle>Пользователи</CardTitle>
            <CardDescription>
              Зарегистрированные участники и их доступ к панели.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="pb-4">
              <Field>
                <FieldLabel htmlFor="users-search">
                  Поиск пользователей
                </FieldLabel>
                <Input
                  id="users-search"
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Имя, email или username"
                />
              </Field>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Проверен</TableHead>
                  <TableHead>Доступ</TableHead>
                  <TableHead>Организация</TableHead>
                  <TableHead>Регистрация</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.username ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={user.emailVerified ? "default" : "outline"}
                      >
                        {user.emailVerified ? "Да" : "Нет"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-2">
                        <Badge variant={user.isAdmin ? "default" : "outline"}>
                          {user.isAdmin ? "Администратор" : "Участник"}
                        </Badge>
                        {user.isBootstrapAdmin ? (
                          <Badge variant="secondary">Bootstrap</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Select
                          value={user.orgId ?? "none"}
                          onValueChange={(value) =>
                            updateUserOrg(
                              user.id,
                              value === "none" ? null : value,
                            )
                          }
                        >
                          <SelectTrigger size="sm" className="w-40">
                            <SelectValue placeholder="Без организации" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="none">
                                Без организации
                              </SelectItem>
                              {organizations.map((org) => (
                                <SelectItem key={org.id} value={org.id}>
                                  {org.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {user.orgId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              user.isFacilitator ? "outline" : "secondary"
                            }
                            disabled={pending}
                            onClick={() => {
                              const orgId = user.orgId;
                              if (!orgId) return;
                              updateFacilitator(
                                user.id,
                                orgId,
                                !user.isFacilitator,
                              );
                            }}
                          >
                            {user.isFacilitator
                              ? "Снять с ведущего"
                              : "Сделать ведущим"}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{dateLabel(user.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={user.isAdmin ? "outline" : "default"}
                          disabled={pending || user.isBootstrapAdmin}
                          onClick={() => updateAdmin(user.id, !user.isAdmin)}
                        >
                          {user.isAdmin ? "Отозвать" : "Назначить админом"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {section === "organizations" ? (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Новая организация</CardTitle>
              <CardDescription>
                Компания или команда, для которой открыт доступ к тренажёру.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  createOrganization();
                }}
              >
                <Field className="min-w-64 flex-1">
                  <FieldLabel htmlFor="new-org-name">Название</FieldLabel>
                  <Input
                    id="new-org-name"
                    value={newOrgName}
                    onChange={(event) => setNewOrgName(event.target.value)}
                    placeholder="Например, «Вкусно и точка»"
                  />
                </Field>
                <Button type="submit" disabled={pending || !newOrgName.trim()}>
                  Создать
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Организации</CardTitle>
              <CardDescription>
                Участники назначаются на организацию, а ведущие — из вкладки
                «Пользователи».
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Участников</TableHead>
                    <TableHead>Ведущих</TableHead>
                    <TableHead>Создана</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground text-center"
                      >
                        Организаций пока нет.
                      </TableCell>
                    </TableRow>
                  ) : (
                    organizations.map((org) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">
                          {org.name}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {org.members}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {org.facilitators}
                        </TableCell>
                        <TableCell>{dateLabel(org.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
