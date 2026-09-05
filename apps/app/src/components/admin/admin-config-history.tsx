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
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@acme/ui";
import { IconChevronDown, IconHistory, IconRestore } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

interface VersionRow {
  id: string;
  actorId: string | null;
  source: string;
  summary: string;
  revertedVersionId: string | null;
  createdAt: Date | string;
  changes: Array<{ path: string; before: unknown; after: unknown }>;
}

export function AdminConfigHistory() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const rows = await client.admin.game.versions.list({ limit: 30 });
    setVersions(rows as VersionRow[]);
  }, []);

  useEffect(() => {
    if (!open || versions.length > 0) return;
    void load().catch((cause) =>
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось загрузить историю",
      ),
    );
  }, [load, open, versions.length]);

  async function rollback() {
    if (!rollbackId) return;
    setPending(true);
    try {
      await client.admin.game.versions.rollback({ versionId: rollbackId });
      toast.success("Конфигурация восстановлена, откат записан новой версией");
      setRollbackId(null);
      setVersions([]);
      await load();
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка отката");
    } finally {
      setPending(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconHistory /> История конфигурации
              </CardTitle>
              <CardDescription>
                Все изменения форм и LLM с возможностью безопасного отката.
              </CardDescription>
            </div>
            <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
              {open ? "Свернуть" : "Показать историю"}
              <IconChevronDown data-icon="inline-end" />
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-3">
            {versions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                История пока пуста или загружается.
              </p>
            ) : null}
            {versions.map((version) => (
              <div
                key={version.id}
                className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{version.summary}</p>
                    <Badge variant="outline">{version.source}</Badge>
                    <Badge variant="secondary">
                      {version.changes.length} изменений
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {new Intl.DateTimeFormat("ru-RU", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(version.createdAt))}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setRollbackId(version.id)}
                >
                  <IconRestore data-icon="inline-start" />
                  Откатить
                </Button>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>

      <AlertDialog
        open={rollbackId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRollbackId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Восстановить состояние до этой версии?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Текущее состояние не потеряется: оно будет сохранено как новая
              запись, поэтому этот откат тоже можно отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={rollback}>
              Восстановить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
