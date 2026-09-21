"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
} from "@acme/ui";

/** Provides a text fallback for sending replies during a voice dialog. */
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
      <CardContent>
        <PromptInput
          onSubmit={(event) => {
            event.preventDefault();
            if (props.value.trim()) props.onSend();
          }}
        >
          <PromptInputTextarea
            aria-label="Реплика персонажу"
            value={props.value}
            disabled={props.pending}
            onSubmit={() => {
              if (props.value.trim()) props.onSend();
            }}
            onChange={(event) => props.onChange(event.target.value)}
          />
          <PromptInputToolbar className="justify-end">
            <PromptInputSubmit
              aria-label="Отправить реплику"
              disabled={props.pending || !props.value.trim()}
              status={props.pending ? "submitted" : undefined}
            />
          </PromptInputToolbar>
        </PromptInput>
      </CardContent>
    </Card>
  );
}
