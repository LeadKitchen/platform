"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Separator,
} from "@acme/ui";
import type { EndDialog } from "./voice-dialog-room-types";

export function VoiceDialogEndAlert(props: {
  endDialog: EndDialog;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { endDialog } = props;
  return (
    <AlertDialog open={endDialog !== null} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {endDialog?.kind === "missing"
              ? "В разговоре не хватает договорённостей"
              : "Завершить голосовую тренировку?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {endDialog?.kind === "missing"
              ? "Можно вернуться в разговор и закрыть ключевые пункты:"
              : "AI остановит разговор и подготовит персональный отчёт."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {endDialog?.kind === "missing" ? (
          <>
            <Separator />
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {endDialog.missingCritical.map((criterion) => (
                <li key={criterion.id}>{criterion.title}</li>
              ))}
            </ul>
          </>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Продолжить разговор</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>
            {endDialog?.kind === "missing"
              ? "Всё равно завершить"
              : "Завершить и оценить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
