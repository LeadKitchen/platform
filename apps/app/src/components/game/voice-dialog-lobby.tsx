"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import {
  IconArrowLeft,
  IconMicrophone,
  IconPlayerPlay,
  IconSparkles,
} from "@tabler/icons-react";
import { CharacterAvatar } from "~/components/game/character-avatar";
import type { VoiceDialogRoomProps } from "./voice-dialog-room-types";

export function VoiceDialogLobby(props: {
  employee: VoiceDialogRoomProps["employee"];
  employeeAvatar: string;
  task: VoiceDialogRoomProps["task"];
  shift: VoiceDialogRoomProps["shift"];
  variantName: string;
  micSupported: boolean;
  onBack: () => void;
  onStart: () => void;
}) {
  const { employee, employeeAvatar, task, shift, variantName } = props;
  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader className="items-center text-center">
        <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
          <IconSparkles className="size-7" />
        </div>
        <CardTitle>Начать голосовую тренировку</CardTitle>
        <CardDescription>
          Проверьте персонажа и разрешите браузеру доступ к микрофону после
          запуска.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-xl border p-4">
          <CharacterAvatar
            className="size-14"
            src={employeeAvatar}
            name={employee.name}
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{employee.name}</p>
            <p className="text-muted-foreground text-sm">{employee.role}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">Раунд {shift.round}</Badge>
              <Badge variant="outline">ИИ: {variantName}</Badge>
              <Badge variant="outline">Ролевой диалог с ИИ</Badge>
            </div>
          </div>
        </div>
        <Alert>
          <IconMicrophone />
          <AlertTitle>
            {props.micSupported ? "Микрофон готов" : "Микрофон недоступен"}
          </AlertTitle>
          <AlertDescription>
            {props.micSupported
              ? "Микрофон включится сам, как только начнётся разговор — просто говорите, реплика уйдёт персонажу без нажатия кнопок."
              : "Этот браузер не поддерживает запись с микрофона. В комнате останется текстовый резервный ввод."}
          </AlertDescription>
        </Alert>
        <div className="rounded-xl border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Ситуация
          </p>
          <p className="mt-2 text-sm font-medium">{task.title}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={props.onBack}>
            <IconArrowLeft data-icon="inline-start" />
            Назад к сценариям
          </Button>
          <Button onClick={props.onStart}>
            <IconPlayerPlay data-icon="inline-start" />
            Начать разговор
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
