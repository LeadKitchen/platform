"use client";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Switch,
  toast,
} from "@acme/ui";
import type { NotificationPreferences } from "@acme/validators";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "~/orpc/react";

interface ToggleDef {
  key: keyof NotificationPreferences;
  title: string;
  channel: "Email" | "В приложении";
  description: string;
}

interface Group {
  id: string;
  title: string;
  description: string;
  toggles: ToggleDef[];
}

const groups: Group[] = [
  {
    id: "account",
    title: "Аккаунт и безопасность",
    description: "Доступ, восстановление и изменения в команде.",
    toggles: [
      {
        key: "teamInvitesEmail",
        title: "Приглашения в команду",
        channel: "Email",
        description:
          "Приглашения присоединиться к рабочему пространству Ситрук.",
      },
    ],
  },
  {
    id: "coaching",
    title: "Тренировки и коучинг",
    description: "Настройте событие и канал доставки независимо друг от друга.",
    toggles: [
      {
        key: "sessionAnalyticsEmail",
        title: "Итоги тренировки",
        channel: "Email",
        description:
          "Письмо со сводкой, когда одна из ваших сессий получает оценку.",
      },
      {
        key: "sessionAnalysisReadyInApp",
        title: "Разбор сессии готов",
        channel: "В приложении",
        description:
          "Показывать завершённые разборы сессий в центре уведомлений.",
      },
      {
        key: "reviewRemindersEmail",
        title: "Напоминания о разборе",
        channel: "Email",
        description:
          "Письмо-напоминание от руководителя о сессии, которую нужно разобрать.",
      },
      {
        key: "reviewRemindersInApp",
        title: "Напоминания о разборе",
        channel: "В приложении",
        description: "Показывать напоминания о разборе в центре уведомлений.",
      },
      {
        key: "trainingAssignmentsEmail",
        title: "Назначенные тренировки",
        channel: "Email",
        description:
          "Письмо, когда руководитель назначает вам ролевую тренировку.",
      },
      {
        key: "trainingAssignmentsInApp",
        title: "Назначенные тренировки",
        channel: "В приложении",
        description:
          "Показывать новые назначения тренировок в центре уведомлений.",
      },
      {
        key: "actionItemUpdatesEmail",
        title: "Обновления по пунктам действий",
        channel: "Email",
        description:
          "Письмо владельцам и админам команды, когда пункт действий выполнен.",
      },
    ],
  },
  {
    id: "digests",
    title: "Отчёты и сводки",
    description: "Каждая периодическая рассылка настраивается отдельно.",
    toggles: [
      {
        key: "dailyDigestEmail",
        title: "Ежедневная сводка по задачам",
        channel: "Email",
        description:
          "Письмо раз в день со списком открытых и просроченных задач.",
      },
      {
        key: "weeklySummaryEmail",
        title: "Еженедельная сводка",
        channel: "Email",
        description:
          "Ваши сессии, время тренировок, оценки и динамика за неделю.",
      },
    ],
  },
];

function ToggleRow({
  title,
  channel,
  description,
  badge,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  channel: ToggleDef["channel"];
  description: string;
  badge?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="outline">{channel}</Badge>
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="mt-1 shrink-0"
      />
    </div>
  );
}

export function NotificationPreferencesForm({
  initialData,
}: {
  initialData: NotificationPreferences;
}) {
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(initialData);

  const updatePreferences = useMutation(
    orpc.user.updateNotificationPreferences.mutationOptions(),
  );

  function handleToggle(key: keyof NotificationPreferences, checked: boolean) {
    const previous = preferences;
    setPreferences((current) => ({ ...current, [key]: checked }));
    updatePreferences.mutate(
      { [key]: checked },
      {
        onError: (err) => {
          setPreferences(previous);
          toast.error(
            err instanceof Error
              ? err.message
              : "Не удалось сохранить настройку",
          );
        },
      },
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Настройки уведомлений</CardTitle>
        <CardDescription>
          Выберите, какие события Ситрук присылает вам по email или показывает в
          приложении.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y py-0">
        {groups.map((group) => (
          <div key={group.id} className="py-5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {group.title}
            </p>
            <p className="text-muted-foreground text-sm">{group.description}</p>
            <Separator className="mt-4" />
            {group.id === "account" && (
              <>
                <ToggleRow
                  title="Уведомления о безопасности и входе"
                  channel="Email"
                  badge="Обязательно"
                  description="Коды подтверждения, восстановление доступа и важные события безопасности."
                  checked
                  disabled
                />
                <Separator />
              </>
            )}
            {group.toggles.map((toggle, index) => (
              <div key={toggle.key + toggle.channel}>
                <ToggleRow
                  title={toggle.title}
                  channel={toggle.channel}
                  description={toggle.description}
                  checked={preferences[toggle.key]}
                  onCheckedChange={(checked) =>
                    handleToggle(toggle.key, checked)
                  }
                />
                {index < group.toggles.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
