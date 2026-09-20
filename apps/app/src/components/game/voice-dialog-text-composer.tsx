"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Textarea,
} from "@acme/ui";
import { IconSend } from "@tabler/icons-react";

export function VoiceDialogTextComposer(props: {
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
  onSend: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Написать текстом</CardTitle>
        <CardDescription>
          Можно печатать реплики вместо голоса в любой момент разговора.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Textarea
          aria-label="Реплика персонажу"
          value={props.value}
          rows={2}
          disabled={props.pending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (props.value.trim()) props.onSend();
            }
          }}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <Button
          aria-label="Отправить реплику"
          disabled={props.pending || !props.value.trim()}
          onClick={props.onSend}
        >
          <IconSend />
        </Button>
      </CardContent>
    </Card>
  );
}
