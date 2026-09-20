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
  cn,
  ScrollArea,
} from "@acme/ui";
import { IconClock, IconInfoCircle, IconLoader2 } from "@tabler/icons-react";
import type { Ref } from "react";
import type { VoiceTurn } from "./voice-dialog-room-types";
import { durationLabel } from "./voice-dialog-room-utils";

export function VoiceDialogTranscriptPanel(props: {
  turns: VoiceTurn[];
  duration: number;
  employeeName: string;
  employeeAvatar: string;
  managerAvatar: string;
  isAdmin?: boolean;
  onOpenPromptDebug: (eventId: string) => void;
  transcribing: boolean;
  pending: boolean;
  transcriptEndRef: Ref<HTMLDivElement>;
}) {
  return (
    <Card className="min-h-0 gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Транскрипция</CardTitle>
            <CardDescription>Разговор в реальном времени</CardDescription>
          </div>
          <Badge variant="outline">
            <IconClock />
            {durationLabel(props.duration)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <ScrollArea className="min-h-[420px] flex-1 px-5 py-5">
          <div className="mx-auto flex max-w-[640px] flex-col gap-5">
            {props.turns.map((turn, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: Реплики только добавляются в конец.
                key={`${turn.role}-${index}`}
                className={cn(
                  "flex max-w-[85%] flex-col gap-1.5 rounded-2xl px-4 py-3",
                  turn.role === "manager"
                    ? "bg-primary/10 ml-auto"
                    : "bg-muted mr-auto",
                )}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="size-6">
                    <AvatarImage
                      src={
                        turn.role === "manager"
                          ? props.managerAvatar
                          : props.employeeAvatar
                      }
                      alt={turn.role === "manager" ? "Вы" : props.employeeName}
                    />
                    <AvatarFallback>
                      {turn.role === "manager"
                        ? "ВЫ"
                        : props.employeeName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {turn.role === "manager" ? "Вы" : props.employeeName}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                    {turn.at}
                  </span>
                  {props.isAdmin && turn.promptEventId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="Показать промпт, отправленный в LLM"
                      onClick={() =>
                        props.onOpenPromptDebug(turn.promptEventId ?? "")
                      }
                    >
                      <IconInfoCircle className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                  {turn.text}
                </p>
              </div>
            ))}
            {props.transcribing ? (
              <div className="bg-primary/5 ml-auto flex max-w-[85%] items-center gap-2 rounded-2xl border border-dashed px-4 py-3">
                <IconLoader2 className="animate-spin" />
                <p className="text-muted-foreground text-sm italic">
                  Распознаём реплику…
                </p>
              </div>
            ) : null}
            {props.pending ? (
              <div className="bg-muted mr-auto flex items-center gap-2 rounded-2xl px-4 py-3 text-sm">
                <IconLoader2 className="animate-spin" />
                {props.employeeName} формулирует ответ…
              </div>
            ) : null}
            <div ref={props.transcriptEndRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
