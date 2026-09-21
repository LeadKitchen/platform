"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  Loader,
  Message,
  MessageAvatar,
  MessageContent,
  Response,
} from "@acme/ui";
import { IconClock, IconInfoCircle } from "@tabler/icons-react";
import type { VoiceTurn } from "./voice-dialog-room-types";
import { durationLabel } from "./voice-dialog-room-utils";

/** Renders the auto-scrolling transcript and live dialog activity states. */
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
        <Conversation className="min-h-[420px]">
          <ConversationContent className="mx-auto flex max-w-[640px] flex-col gap-5 px-5 py-5">
            {props.turns.map((turn, index) => {
              const from = turn.role === "manager" ? "user" : "assistant";
              return (
                <Message
                  // biome-ignore lint/suspicious/noArrayIndexKey: Реплики только добавляются в конец.
                  key={`${turn.role}-${index}`}
                  from={from}
                >
                  <MessageContent>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {from === "user" ? "Вы" : props.employeeName}
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
                    <Response>{turn.text}</Response>
                  </MessageContent>
                  <MessageAvatar
                    src={
                      from === "user"
                        ? props.managerAvatar
                        : props.employeeAvatar
                    }
                    name={from === "user" ? "Вы" : props.employeeName}
                  />
                </Message>
              );
            })}
            {props.transcribing ? (
              <Message from="user">
                <MessageContent className="text-muted-foreground flex items-center gap-2 border border-dashed italic">
                  <Loader size={14} />
                  Распознаём реплику…
                </MessageContent>
              </Message>
            ) : null}
            {props.pending ? (
              <Message from="assistant">
                <MessageContent className="flex items-center gap-2">
                  <Loader size={14} />
                  {props.employeeName} формулирует ответ…
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </CardContent>
    </Card>
  );
}
