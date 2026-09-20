"use client";

import { Badge, Button, Card, CardContent, Separator } from "@acme/ui";
import {
  IconActivity,
  IconMessageCircle,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerStop,
  IconSparkles,
  IconVideo,
} from "@tabler/icons-react";

export function VoiceDialogHeaderBar(props: {
  employeeName: string;
  taskTitle: string;
  variantName: string;
  micSupported: boolean;
  micMuted: boolean;
  micRecording: boolean;
  micError: string | null;
  onToggleMuted: () => void;
  transcriptVisible: boolean;
  onToggleTranscript: () => void;
  selfViewVisible: boolean;
  onToggleSelfView: () => void;
  pending: boolean;
  onEndClick: () => void;
}) {
  return (
    <Card className="py-3">
      <CardContent className="flex flex-wrap items-center gap-2 px-4">
        <div className="mr-auto flex items-center gap-3">
          <div className="bg-primary flex size-9 items-center justify-center rounded-xl text-primary-foreground">
            <IconSparkles />
          </div>
          <div>
            <p className="text-sm font-semibold">Ролевой диалог с ИИ</p>
            <p className="text-muted-foreground text-xs">
              {props.employeeName} · {props.taskTitle}
            </p>
          </div>
        </div>
        <Badge variant="outline">ИИ: {props.variantName}</Badge>
        <Badge variant="outline">
          <IconActivity />
          {props.micError
            ? "Сигнал: нужна проверка"
            : props.micRecording
              ? "Слушаю вас…"
              : props.micMuted
                ? "Микрофон выключен"
                : "Сигнал: отличный"}
        </Badge>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant={props.micMuted ? "destructive" : "outline"}
            aria-label={
              props.micMuted ? "Включить микрофон" : "Выключить микрофон"
            }
            disabled={!props.micSupported}
            onClick={props.onToggleMuted}
          >
            {props.micMuted ? <IconMicrophoneOff /> : <IconMicrophone />}
          </Button>
          <Button
            size="icon"
            variant={props.transcriptVisible ? "secondary" : "outline"}
            aria-label={
              props.transcriptVisible
                ? "Скрыть транскрипт"
                : "Показать транскрипт"
            }
            onClick={props.onToggleTranscript}
          >
            <IconMessageCircle />
          </Button>
          <Button
            size="icon"
            variant={props.selfViewVisible ? "secondary" : "outline"}
            aria-label={
              props.selfViewVisible
                ? "Скрыть свой экран"
                : "Показать свой экран"
            }
            onClick={props.onToggleSelfView}
          >
            <IconVideo />
          </Button>
        </div>
        <Separator orientation="vertical" className="h-6" />
        <Button
          size="icon"
          variant="destructive"
          aria-label="Завершить разговор"
          disabled={props.pending}
          onClick={props.onEndClick}
        >
          <IconPlayerStop />
        </Button>
      </CardContent>
    </Card>
  );
}
