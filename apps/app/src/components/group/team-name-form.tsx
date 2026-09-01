"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
} from "@acme/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

const MAX_LENGTH = 32;

/** Renames the active workspace, mirroring the "Team Name" settings card. */
export function TeamNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const nameInputId = useId();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const dirty = name.trim() !== initialName.trim() && name.trim().length >= 2;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;
    setPending(true);
    try {
      await client.org.workspace.rename({ name: name.trim() });
      toast.success("Название команды обновлено");
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить название",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Название команды</CardTitle>
        <p className="text-muted-foreground text-sm">
          Так команда будет называться для всех участников.
        </p>
      </CardHeader>
      <CardContent className="py-5">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field className="max-w-md">
            <FieldLabel htmlFor={nameInputId}>Название команды</FieldLabel>
            <Input
              id={nameInputId}
              value={name}
              onChange={(event) =>
                setName(event.target.value.slice(0, MAX_LENGTH))
              }
              maxLength={MAX_LENGTH}
              required
              minLength={2}
            />
          </Field>
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-xs">
              Не более {MAX_LENGTH} символов.
            </p>
            <Button type="submit" size="sm" disabled={pending || !dirty}>
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
