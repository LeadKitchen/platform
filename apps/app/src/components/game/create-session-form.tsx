"use client";

import {
  Badge,
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { client } from "~/orpc/react";

export interface VariantOption {
  id: string;
  name: string;
}

export interface SessionDefaults {
  defaultVariantId: string | null;
  defaultRound: 2 | 3;
  allowRoundThree: boolean;
}

/**
 * Открытие сессии игры. Вариант ИИ-конвейера фиксируется на всю сессию:
 * иначе одну и ту же команду оценивали бы разные подходы, и сравнение
 * подходов потеряло бы смысл.
 */
export function CreateSessionForm({
  variants,
  defaults,
}: {
  variants: VariantOption[];
  defaults: SessionDefaults;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [round, setRound] = useState<"2" | "3">(
    String(defaults.defaultRound) as "2" | "3",
  );
  const variantId = defaults.defaultVariantId ?? variants[0]?.id ?? "";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const session = await client.game.session.create({
        title:
          title.trim() ||
          `Моя команда · ${new Intl.DateTimeFormat("ru-RU", {
            day: "numeric",
            month: "long",
          }).format(new Date())}`,
        round: round === "3" ? 3 : 2,
        variantId: variantId || undefined,
      });
      if (!session?.id) {
        setError("Сессия не создана, попробуйте ещё раз");
        setPending(false);
        return;
      }
      router.push(`/game/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup className="grid gap-4 lg:grid-cols-[1fr_260px_auto] lg:items-end">
        <Field>
          <FieldLabel htmlFor="session-title">
            Название команды <Badge variant="outline">необязательно</Badge>
          </FieldLabel>
          <Input
            id="session-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например, Команда шефов"
          />
          <FieldDescription>
            Если оставить поле пустым, мы назовём смену автоматически.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="session-round">Практический раунд</FieldLabel>
          <Select
            value={round}
            onValueChange={(value) => setRound(value as "2" | "3")}
          >
            <SelectTrigger id="session-round">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="2">Раунд 2 · команда</SelectItem>
                {defaults.allowRoundThree ? (
                  <SelectItem value="3">Раунд 3 · один повар</SelectItem>
                ) : null}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Готовим смену…" : "Начать практику"}
        </Button>

        {error ? (
          <p className="text-destructive text-sm lg:col-span-3">{error}</p>
        ) : null}
      </FieldGroup>
    </form>
  );
}
