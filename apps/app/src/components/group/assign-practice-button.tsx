"use client";

import { Button } from "@acme/ui";
import { IconSend } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

interface AssignPracticeButtonProps {
  participantId: string;
  participantName: string;
  focus?: { id: string; title: string };
}

/** One-click coaching follow-up from the facilitator's performance table. */
export function AssignPracticeButton({
  participantId,
  participantName,
  focus,
}: AssignPracticeButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!focus) return <span className="text-muted-foreground">—</span>;
  const target = focus;

  async function assign() {
    if (pending) return;
    setPending(true);
    try {
      const result = await client.org.training.assign({
        participantId,
        criterionId: target.id,
        criterionTitle: target.title,
      });
      toast(
        result.duplicate
          ? `Практика по критерию «${target.title}» уже назначена`
          : `Практика назначена: ${participantName}`,
      );
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось назначить практику",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={assign}
    >
      <IconSend data-icon="inline-start" />
      {pending ? "Назначаем…" : "Назначить"}
    </Button>
  );
}
