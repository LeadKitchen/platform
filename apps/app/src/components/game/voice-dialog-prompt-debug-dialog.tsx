"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui";
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import type { PromptDebugData } from "./voice-dialog-room-types";

export function VoiceDialogPromptDebugDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  data: PromptDebugData | null;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Промпт, отправленный в LLM</DialogTitle>
          <DialogDescription>
            {props.data?.model
              ? `Модель: ${props.data.model}`
              : "Системный промпт и история диалога, из которых сгенерирована эта реплика."}
          </DialogDescription>
        </DialogHeader>

        {props.loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <IconLoader2 className="size-4 animate-spin" />
            Загрузка…
          </p>
        ) : props.error ? (
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>Не удалось получить промпт</AlertTitle>
            <AlertDescription>{props.error}</AlertDescription>
          </Alert>
        ) : props.data ? (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
                System
              </p>
              <pre className="bg-muted overflow-x-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                {props.data.system}
              </pre>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Messages
              </p>
              {props.data.messages.map((message, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: Список сообщений статичен и не переупорядочивается.
                  key={`${index}-${message.role}`}
                  className="rounded-md border p-3"
                >
                  <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                    {message.role}
                  </p>
                  <p className="text-xs whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
