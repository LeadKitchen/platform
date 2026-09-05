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
  CardHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@acme/ui";
import {
  IconFileText,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "~/orpc/react";

type Audience = "character" | "judge" | "both";
type SourceType = "pdf" | "docx" | "txt";
type DocumentStatus = "processing" | "needs_review" | "ready" | "failed";

export interface KnowledgeDocumentView {
  id: string;
  title: string;
  sourceType: SourceType;
  status: DocumentStatus;
  statusMessage: string | null;
  audience: Audience;
  version: number;
  createdAt: string | Date;
}

interface ChunkView {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  audience: Audience;
}

interface RetrievalHit {
  id: string;
  text: string;
  audience: Audience;
  documentId: string;
  documentTitle: string;
  documentStatus: DocumentStatus;
  score: number;
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  character: "Персонаж",
  judge: "Только методология",
  both: "Персонаж и методология",
};

const AUDIENCE_HINT: Record<Audience, string> = {
  character: "Сотрудник может использовать это в разговоре.",
  judge: "Скрыто от персонажа — попадёт только в оценку.",
  both: "Нейтральный факт, безопасно показать персонажу.",
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  processing: "Обрабатывается",
  needs_review: "Ждёт проверки",
  ready: "Опубликован",
  failed: "Ошибка",
};

function sourceTypeForFile(file: File): SourceType | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "pdf" || extension === "docx" || extension === "txt"
    ? extension
    : null;
}

function statusVariant(
  status: DocumentStatus,
): "outline" | "accent" | "secondary" | "destructive" {
  switch (status) {
    case "ready":
      return "accent";
    case "needs_review":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (document: KnowledgeDocumentView) => void;
}) {
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("pdf");
  const [audience, setAudience] = useState<Audience>("character");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setTitle("");
    setSourceType("pdf");
    setAudience("character");
    setFile(null);
  }

  async function upload() {
    if (!file || title.trim().length === 0 || pending) return;
    const selectedSourceType = sourceTypeForFile(file);
    if (!selectedSourceType || selectedSourceType !== sourceType) {
      toast.error("Формат файла не совпадает с выбранным форматом");
      return;
    }
    setPending(true);
    try {
      const { key, uploadUrl } = await client.org.knowledge.requestUpload({
        sourceType: selectedSourceType,
        size: file.size,
      });
      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      if (!putResponse.ok) {
        throw new Error("Не удалось загрузить файл в хранилище");
      }
      const document = await client.org.knowledge.confirmUpload({
        key,
        title: title.trim(),
        sourceType: selectedSourceType,
        audience,
      });
      onUploaded(document as KnowledgeDocumentView);
      toast.success("Документ загружен, начата обработка");
      reset();
      onOpenChange(false);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить документ",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Загрузить документ</DialogTitle>
          <DialogDescription>
            PDF, DOCX или TXT. После обработки проверьте разметку разделов перед
            публикацией — до этого документ не виден персонажу.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="knowledge-title">Название</FieldLabel>
            <Input
              id="knowledge-title"
              value={title}
              placeholder="Например, Регламент кухни"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="knowledge-source-type">Формат</FieldLabel>
              <Select
                value={sourceType}
                onValueChange={(value) => setSourceType(value as SourceType)}
              >
                <SelectTrigger id="knowledge-source-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="docx">DOCX</SelectItem>
                    <SelectItem value="txt">TXT</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="knowledge-audience">
                Доступ по умолчанию
              </FieldLabel>
              <Select
                value={audience}
                onValueChange={(value) => setAudience(value as Audience)}
              >
                <SelectTrigger id="knowledge-audience" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="character">Персонаж</SelectItem>
                    <SelectItem value="both">Персонаж и методология</SelectItem>
                    <SelectItem value="judge">Только методология</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="knowledge-file">Файл</FieldLabel>
            <input
              id="knowledge-file"
              type="file"
              accept=".pdf,.docx,.txt"
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                if (!selectedFile) {
                  setFile(null);
                  return;
                }
                const selectedSourceType = sourceTypeForFile(selectedFile);
                if (!selectedSourceType) {
                  setFile(null);
                  toast.error("Поддерживаются только PDF, DOCX и TXT");
                  return;
                }
                setFile(selectedFile);
                setSourceType(selectedSourceType);
              }}
            />
          </Field>
        </FieldGroup>
        <DialogFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={!file || title.trim().length === 0 || pending}
            onClick={upload}
          >
            {pending ? "Загружаем…" : "Загрузить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  document,
  onOpenChange,
  onPublished,
}: {
  document: KnowledgeDocumentView;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}) {
  const [chunks, setChunks] = useState<ChunkView[] | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    client.org.knowledge
      .get({ id: document.id })
      .then((result) => setChunks(result.chunks as ChunkView[]))
      .catch(() => toast.error("Не удалось загрузить фрагменты документа"));
  }, [document.id]);

  async function setChunkAudience(chunkId: string, audience: Audience) {
    try {
      await client.org.knowledge.updateChunkAudience({
        documentId: document.id,
        chunkId,
        audience,
      });
      setChunks(
        (current) =>
          current?.map((chunk) =>
            chunk.id === chunkId ? { ...chunk, audience } : chunk,
          ) ?? null,
      );
    } catch {
      toast.error("Не удалось сохранить разметку фрагмента");
    }
  }

  async function publish() {
    setPending(true);
    try {
      await client.org.knowledge.publish({ id: document.id });
      toast.success("Документ опубликован и доступен персонажу");
      onPublished();
      onOpenChange(false);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось опубликовать",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{document.title}</DialogTitle>
          <DialogDescription>
            Проверьте разметку каждого фрагмента: «Персонаж» — сотрудник может
            это сказать; «Только методология» — скрыто от него и участник не
            получит подсказку.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {chunks === null ? (
            <p className="text-muted-foreground text-sm">Загрузка…</p>
          ) : chunks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Фрагменты ещё не готовы — документ в обработке.
            </p>
          ) : (
            chunks.map((chunk) => (
              <div key={chunk.id} className="rounded-lg border p-3">
                <p className="text-sm leading-6 whitespace-pre-wrap">
                  {chunk.text}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs">
                    {AUDIENCE_HINT[chunk.audience]}
                  </span>
                  <Select
                    value={chunk.audience}
                    onValueChange={(value) =>
                      setChunkAudience(chunk.id, value as Audience)
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="character">Персонаж</SelectItem>
                        <SelectItem value="both">
                          Персонаж и методология
                        </SelectItem>
                        <SelectItem value="judge">
                          Только методология
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button
            disabled={
              document.status !== "needs_review" ||
              pending ||
              !chunks ||
              chunks.length === 0
            }
            onClick={publish}
          >
            {pending ? "Публикуем…" : "Опубликовать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewPanel() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RetrievalHit[] | null>(null);
  const [pending, setPending] = useState(false);

  async function search() {
    if (query.trim().length === 0 || pending) return;
    setPending(true);
    try {
      const result = await client.org.knowledge.previewRetrieval({
        query: query.trim(),
      });
      setHits(result.hits as RetrievalHit[]);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось выполнить поиск",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconSearch className="size-4" />
          <span className="font-medium">Проверка поиска</span>
        </div>
        <p className="text-muted-foreground text-sm">
          Введите вопрос участника и посмотрите, какие фрагменты найдёт бот —
          независимо от того, опубликованы они или ещё на проверке.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={query}
            placeholder="Например: что делать, если заказов больше, чем успеть"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && search()}
          />
          <Button disabled={pending} onClick={search}>
            {pending ? "Ищем…" : "Найти"}
          </Button>
        </div>
        {hits ? (
          hits.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ничего не найдено.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {hits.map((hit) => (
                <div key={hit.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs">
                      {hit.documentTitle} · релевантность{" "}
                      {Math.round(hit.score * 100)}%
                    </span>
                    <div className="flex gap-2">
                      <Badge
                        variant={
                          hit.audience === "judge" ? "destructive" : "outline"
                        }
                      >
                        {AUDIENCE_LABEL[hit.audience]}
                      </Badge>
                      <Badge variant={statusVariant(hit.documentStatus)}>
                        {STATUS_LABEL[hit.documentStatus]}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 leading-6 whitespace-pre-wrap">
                    {hit.text}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

export function KnowledgeLibrary({
  initialDocuments,
}: {
  initialDocuments: KnowledgeDocumentView[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewing, setReviewing] = useState<KnowledgeDocumentView | null>(
    null,
  );
  const [removing, setRemoving] = useState<KnowledgeDocumentView | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await client.org.knowledge.list();
      setDocuments(rows as KnowledgeDocumentView[]);
    } catch {
      // A missed background refresh is not worth surfacing to the admin.
    }
  }, []);

  useEffect(() => {
    const hasProcessing = documents.some(
      (document) => document.status === "processing",
    );
    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(refresh, 4000);
    }
    if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [documents, refresh]);

  async function retry(document: KnowledgeDocumentView) {
    setPendingId(document.id);
    try {
      await client.org.knowledge.retry({ id: document.id });
      toast.success("Обработка запущена заново");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось перезапустить",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setPendingId(removing.id);
    try {
      await client.org.knowledge.remove({ id: removing.id });
      setDocuments((current) =>
        current.filter((document) => document.id !== removing.id),
      );
      setRemoving(null);
      toast.success("Документ удалён");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось удалить документ",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-medium tracking-[-0.035em]">
            База знаний
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Загруженные документы становятся общим источником знаний для
            ИИ-персонажа во всех ролевых диалогах игры. Персонаж видит только
            опубликованные разделы, помеченные «Персонаж».
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            <IconRefresh /> Обновить
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <IconUpload /> Загрузить документ
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <IconFileText className="text-muted-foreground size-8" />
              <p className="text-muted-foreground text-sm">
                Документов пока нет. Загрузите первый, чтобы обучить персонажа
                вашим материалам.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Документ</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Доступ</TableHead>
                  <TableHead>Загружен</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        disabled={document.status === "processing"}
                        onClick={() => setReviewing(document)}
                      >
                        {document.title}
                      </button>
                      <div className="text-muted-foreground text-xs uppercase">
                        {document.sourceType}
                      </div>
                      {document.status === "failed" &&
                      document.statusMessage ? (
                        <div className="text-destructive mt-1 text-xs">
                          {document.statusMessage}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(document.status)}>
                        {STATUS_LABEL[document.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {AUDIENCE_LABEL[document.audience]}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(document.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {document.status === "needs_review" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReviewing(document)}
                          >
                            Проверить
                          </Button>
                        ) : null}
                        {document.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pendingId === document.id}
                            onClick={() => retry(document)}
                          >
                            Повторить
                          </Button>
                        ) : null}
                        <Button
                          size="icon"
                          className="size-8"
                          variant="ghost"
                          aria-label="Удалить"
                          onClick={() => setRemoving(document)}
                        >
                          <IconTrash />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PreviewPanel />

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={(document) =>
          setDocuments((current) => [document, ...current])
        }
      />

      {reviewing ? (
        <ReviewDialog
          document={reviewing}
          onOpenChange={(open) => !open && setReviewing(null)}
          onPublished={refresh}
        />
      ) : null}

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
            <AlertDialogDescription>
              «{removing?.title}» и все его фрагменты будут удалены без
              возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingId === removing?.id}
              onClick={remove}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
