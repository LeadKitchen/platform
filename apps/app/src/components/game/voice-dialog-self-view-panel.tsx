"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import {
  IconClock,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerStop,
  IconVolume2,
  IconVolumeOff,
} from "@tabler/icons-react";
import { durationLabel } from "./voice-dialog-room-utils";

export function VoiceDialogSelfViewPanel(props: {
  managerAvatar: string;
  duration: number;
  micSupported: boolean;
  micMuted: boolean;
  onToggleMuted: () => void;
  voiceSupported: boolean;
  voiceEnabled: boolean;
  onToggleVoiceEnabled: () => void;
  onEndClick: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Вы</CardTitle>
          <Badge variant="outline">
            <IconClock />
            {durationLabel(props.duration)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-[150px] flex-col items-center justify-center gap-3">
        <Avatar className="size-20">
          <AvatarImage src={props.managerAvatar} alt="Вы" />
          <AvatarFallback>ВЫ</AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            size="icon"
            variant={props.micMuted ? "destructive" : "secondary"}
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
            variant={props.voiceEnabled ? "secondary" : "destructive"}
            aria-pressed={props.voiceEnabled}
            aria-label={
              props.voiceEnabled
                ? "Выключить озвучку ответов"
                : "Включить озвучку ответов"
            }
            disabled={!props.voiceSupported}
            onClick={props.onToggleVoiceEnabled}
          >
            {props.voiceEnabled ? <IconVolume2 /> : <IconVolumeOff />}
          </Button>
          <Button
            size="icon"
            variant="destructive"
            aria-label="Завершить разговор"
            onClick={props.onEndClick}
          >
            <IconPlayerStop />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Говорите свободно · M — выключить микрофон · T — транскрипт
        </p>
      </CardContent>
    </Card>
  );
}
