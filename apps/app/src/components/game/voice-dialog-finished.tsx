"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import { IconCheck } from "@tabler/icons-react";

export function VoiceDialogFinished(props: { onOpenReport: () => void }) {
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader className="items-center text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <IconCheck className="size-6" />
        </div>
        <CardTitle>Тренировка завершена</CardTitle>
        <CardDescription>
          Откройте отчёт с оценкой разговора и рекомендациями.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button onClick={props.onOpenReport}>Открыть отчёт</Button>
      </CardContent>
    </Card>
  );
}
