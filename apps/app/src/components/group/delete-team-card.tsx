"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
} from "@acme/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

/** Guarded, irreversible team deletion — refuses a user's only workspace. */
export function DeleteTeamCard({
  teamName,
  canDelete,
}: {
  teamName: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const confirmInputId = useId();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const confirmed = confirmText.trim() === teamName.trim();

  async function deleteTeam() {
    if (pending || !confirmed) return;
    setPending(true);
    try {
      await client.org.workspace.remove();
      toast.success("Команда удалена");
      setOpen(false);
      router.push("/game");
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось удалить команду",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-4 rounded-xl border p-5">
        <p className="text-destructive flex items-center gap-2 text-sm">
          <IconAlertTriangle className="size-4 shrink-0" />
          Удаление команды безвозвратно уничтожает всех участников, рубрики,
          библиотеку звонков и аналитику. Отменить это действие нельзя.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-destructive font-medium">Удалить команду</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Полностью удаляет команду и все её данные. Действие необратимо.
            </p>
            {!canDelete ? (
              <p className="text-muted-foreground mt-1 text-sm">
                Нельзя удалить единственную команду. Сначала создайте другую.
              </p>
            ) : null}
          </div>
          <Button
            variant="destructive"
            disabled={!canDelete}
            onClick={() => setOpen(true)}
          >
            Удалить
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <IconAlertTriangle className="text-destructive size-5" />
            <DialogTitle className="text-2xl">
              Удалить «{teamName}»?
            </DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={confirmInputId}>
                Чтобы подтвердить, введите название команды: «{teamName}»
              </FieldLabel>
              <Input
                id={confirmInputId}
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={pending || !confirmed}
              onClick={deleteTeam}
            >
              {pending ? "Удаляем…" : "Удалить безвозвратно"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
