"use client";

import { Alert, AlertDescription, AlertTitle } from "@acme/ui";
import { IconAlertTriangle } from "@tabler/icons-react";

export function VoiceDialogNotices(props: {
  notice: string | null;
  error: string | null;
}) {
  return (
    <>
      {props.notice ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Обратите внимание</AlertTitle>
          <AlertDescription>{props.notice}</AlertDescription>
        </Alert>
      ) : null}
      {props.error ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>Голосовой разговор прерван</AlertTitle>
          <AlertDescription>{props.error}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
