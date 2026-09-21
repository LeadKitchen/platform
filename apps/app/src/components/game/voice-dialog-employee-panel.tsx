"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@acme/ui";
import { IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import { CharacterAvatar } from "~/components/game/character-avatar";

const STATUS_BARS = [0, 1, 2, 3, 4, 5, 6];

export function VoiceDialogEmployeePanel(props: {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  employeeAvatar: string;
  variantId: string;
  variantName: string;
  isAdmin?: boolean;
  pending: boolean;
  speaking: boolean;
  transcribing: boolean;
  micMuted: boolean;
  micRecording: boolean;
}) {
  const { pending, speaking, transcribing, micMuted, micRecording } = props;
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{props.employeeName}</CardTitle>
            <CardDescription>{props.employeeRole}</CardDescription>
          </div>
          <Badge>
            {pending ? "Думает" : speaking ? "Говорит" : "На связи"}
          </Badge>
        </div>
        {props.isAdmin ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <IconSettings className="size-3.5" />
              Админ: где поменять поведение
            </span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              render={
                <Link
                  href={`/admin/game/employees?employeeId=${encodeURIComponent(props.employeeId)}`}
                />
              }
              nativeButton={false}
            >
              Профиль сотрудника
            </Button>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              render={
                <Link
                  href={`/admin/game/variants?variantId=${encodeURIComponent(props.variantId)}`}
                />
              }
              nativeButton={false}
            >
              ИИ-вариант «{props.variantName}»
            </Button>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              render={<Link href="/admin/game/settings" />}
              nativeButton={false}
            >
              Настройки игры
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-5">
        <div className="relative">
          {speaking || pending ? (
            <span className="bg-primary/20 absolute -inset-4 animate-pulse rounded-full" />
          ) : null}
          <CharacterAvatar
            className="relative size-28 border-4 border-background shadow-lg"
            src={props.employeeAvatar}
            name={props.employeeName}
          />
        </div>
        <div className="flex h-8 items-center gap-1" aria-hidden="true">
          {STATUS_BARS.map((bar) => (
            <span
              key={bar}
              className={cn(
                "bg-primary w-1 rounded-full transition-all",
                speaking || pending ? "animate-pulse" : "h-1",
                bar % 3 === 0 ? "h-7" : bar % 2 === 0 ? "h-4" : "h-5",
              )}
            />
          ))}
        </div>
        <p className="text-muted-foreground text-center text-sm">
          {pending
            ? "AI анализирует вашу реплику"
            : transcribing
              ? "Распознаём вашу реплику…"
              : speaking
                ? "Слушайте ответ персонажа"
                : micMuted
                  ? "Микрофон выключен — включите, чтобы говорить"
                  : micRecording
                    ? "Слушаю вас — договорите и сделайте паузу"
                    : "Говорите в любой момент, микрофон уже слушает"}
        </p>
      </CardContent>
    </Card>
  );
}
