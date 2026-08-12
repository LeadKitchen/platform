"use client";

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
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
  const [variantId, setVariantId] = useState(
    defaults.defaultVariantId ?? variants[0]?.id ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || title.trim() === "") return;

    setPending(true);
    setError(null);

    try {
      const session = await client.game.session.create({
        title: title.trim(),
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
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <Label htmlFor="session-title">Название сессии</Label>
        <Input
          id="session-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Смена 12 марта, команда 1"
        />
      </div>

      <div className="w-40">
        <Label htmlFor="session-round">Раунд</Label>
        <Select
          value={round}
          onValueChange={(value) => setRound(value as "2" | "3")}
        >
          <SelectTrigger id="session-round">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">Раунд 2</SelectItem>
            {defaults.allowRoundThree ? (
              <SelectItem value="3">Раунд 3 — один в смене</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      <div className="w-56">
        <Label htmlFor="session-variant">Вариант ИИ</Label>
        <Select
          value={variantId}
          onValueChange={(value) => setVariantId(value ?? "")}
        >
          <SelectTrigger id="session-variant">
            <SelectValue placeholder="По умолчанию" />
          </SelectTrigger>
          <SelectContent>
            {variants.map((variant) => (
              <SelectItem key={variant.id} value={variant.id}>
                {variant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={pending}>
        Открыть сессию
      </Button>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}
