"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Separator,
  Textarea,
} from "@acme/ui";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconDeviceFloppy,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

interface SettingsDraft {
  defaultVariantId: string | null;
  defaultRound: 2 | 3;
  defaultDeadlineMinutes: number;
  allowRoundThree: boolean;
  maxActiveSessions: number;
}

interface EmployeeDraft {
  id: string;
  name: string;
  role: string;
  level: "L1" | "L2" | "L3" | "L4";
  gender: "male" | "female";
  competences: Record<string, string>;
  personality: Record<string, unknown>;
  isActive: boolean;
}

interface TaskDraft {
  id: string;
  title: string;
  type: string;
  complexity: number;
  timeCriticality: number;
  requiresCheckpoints: boolean;
  failureModes: string[];
  isActive: boolean;
}

interface VariantDraft {
  id: string;
  name: string;
  description: string;
  engagement: string;
  knowledge: string;
  persona: string;
  evaluation: string;
  model: string | null;
  effort: "low" | "medium" | "high" | "xhigh" | "max" | null;
  params: Record<string, unknown>;
  isActive: boolean;
  weight: number;
}

interface ConfigurationDraft {
  summary: string;
  explanation: string;
  settings: SettingsDraft | null;
  employee: EmployeeDraft | null;
  task: TaskDraft | null;
  variant: VariantDraft | null;
  warnings: string[];
}

const EXAMPLES = [
  "Добавь уверенного су-шефа, который теряется только при конфликте приоритетов",
  "Создай сложный срочный заказ для проверки наставнического стиля",
  "Сделай третий раунд доступным и увеличь дедлайн до 45 минут",
] as const;

function DraftCard({
  title,
  description,
  details,
}: {
  title: string;
  description: string;
  details: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="outline">Черновик</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-sm">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AdminAiAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState<ConfigurationDraft | null>(null);
  const [changes, setChanges] = useState<
    Array<{ path: string; before: unknown; after: unknown }>
  >([]);
  const [baseRevision, setBaseRevision] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model: string; latencyMs: number } | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  async function createDraft() {
    if (pending || request.trim().length < 10) return;
    setPending(true);
    try {
      const result = await client.admin.game.assistant.draftConfiguration({
        request: request.trim(),
      });
      setDraft(result.draft as ConfigurationDraft);
      setBaseRevision(result.baseRevision);
      setChanges(result.changes);
      setMeta(result.meta);
      toast.success("Черновик готов — проверьте изменения");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось создать черновик",
      );
    } finally {
      setPending(false);
    }
  }

  async function applyDraft() {
    if (!draft || !baseRevision) return;
    setPending(true);
    try {
      await client.admin.game.assistant.applyConfiguration({
        request,
        baseRevision,
        draft,
      });
      toast.success("Все изменения применены одной транзакцией");
      setDraft(null);
      setBaseRevision(null);
      setChanges([]);
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Ошибка сохранения");
    } finally {
      setPending(false);
    }
  }

  async function rejectDraft() {
    await client.admin.game.assistant
      .rejectConfiguration({ changes: changes.length })
      .catch(() => undefined);
    setDraft(null);
    setBaseRevision(null);
    setChanges([]);
    toast.info("Черновик отклонён, конфигурация не менялась");
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg">
                <IconSparkles />
              </div>
              <div>
                <CardTitle>Настроить игру с LLM</CardTitle>
                <CardDescription>
                  Опишите результат обычными словами. Помощник подготовит
                  проверяемый черновик и ничего не сохранит без подтверждения.
                </CardDescription>
              </div>
            </div>
            <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
              {open ? "Свернуть" : "Открыть помощника"}
              <IconChevronDown data-icon="inline-end" />
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="admin-ai-request">
                  Что нужно изменить?
                </FieldLabel>
                <Textarea
                  id="admin-ai-request"
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="Например: добавь новичка на холодный цех и задание, где ему нужна пошаговая инструкция…"
                  rows={4}
                  disabled={pending}
                />
                <FieldDescription>
                  Можно попросить создать или изменить сотрудника, задание,
                  вариант ИИ и общие настройки игры.
                </FieldDescription>
              </Field>
            </FieldGroup>

            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <Button
                  key={example}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRequest(example)}
                >
                  {example}
                </Button>
              ))}
            </div>

            <Button
              className="self-start"
              disabled={pending || request.trim().length < 10}
              onClick={createDraft}
            >
              <IconWand data-icon="inline-start" />
              {pending ? "Готовим черновик…" : "Подготовить изменения"}
            </Button>

            {draft ? (
              <div className="flex flex-col gap-4">
                <Separator />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{draft.summary}</h3>
                    {meta ? (
                      <Badge variant="secondary">
                        {meta.model} · {(meta.latencyMs / 1000).toFixed(1)} с
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {draft.explanation}
                  </p>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Что изменится</CardTitle>
                    <CardDescription>
                      Сравнение текущей конфигурации с предложением LLM.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {changes.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        Изменений данных нет.
                      </p>
                    ) : (
                      changes.map((change) => (
                        <Collapsible key={change.path}>
                          <div className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <code className="text-sm">{change.path}</code>
                              <CollapsibleTrigger
                                render={<Button variant="ghost" size="sm" />}
                              >
                                Показать diff
                                <IconChevronDown data-icon="inline-end" />
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <div>
                                  <p className="text-muted-foreground mb-1 text-xs">
                                    Было
                                  </p>
                                  <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs">
                                    {JSON.stringify(change.before, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-muted-foreground mb-1 text-xs">
                                    Станет
                                  </p>
                                  <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs">
                                    {JSON.stringify(change.after, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))
                    )}
                  </CardContent>
                </Card>

                {draft.warnings.length > 0 ? (
                  <Alert>
                    <IconAlertTriangle />
                    <AlertTitle>Проверьте перед применением</AlertTitle>
                    <AlertDescription>
                      <ul className="flex list-disc flex-col gap-1 pl-4">
                        {draft.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  {draft.settings ? (
                    <DraftCard
                      title="Настройки игры"
                      description="Значения для новых сессий"
                      details={[
                        `Раунд по умолчанию: ${draft.settings.defaultRound}`,
                        `Дедлайн: ${draft.settings.defaultDeadlineMinutes} мин`,
                        `Раунд 3: ${draft.settings.allowRoundThree ? "доступен" : "отключён"}`,
                        `Активных сессий: до ${draft.settings.maxActiveSessions}`,
                      ]}
                    />
                  ) : null}

                  {draft.employee ? (
                    <DraftCard
                      title={draft.employee.name}
                      description={`${draft.employee.role} · ${draft.employee.level} · ${draft.employee.gender === "male" ? "муж." : "жен."}`}
                      details={[
                        `ID: ${draft.employee.id}`,
                        `Компетенции: ${Object.keys(draft.employee.competences).join(", ") || "не заданы"}`,
                        draft.employee.isActive
                          ? "Сразу доступен в игре"
                          : "Сохранить выключенным",
                      ]}
                    />
                  ) : null}

                  {draft.task ? (
                    <DraftCard
                      title={draft.task.title}
                      description={`Тип: ${draft.task.type}`}
                      details={[
                        `Сложность: ${draft.task.complexity} из 5`,
                        `Срочность: ${draft.task.timeCriticality} из 5`,
                        `Контрольные точки: ${draft.task.requiresCheckpoints ? "нужны" : "не обязательны"}`,
                        `Рисков: ${draft.task.failureModes.length}`,
                      ]}
                    />
                  ) : null}

                  {draft.variant ? (
                    <DraftCard
                      title={draft.variant.name}
                      description={draft.variant.description}
                      details={[
                        `Вовлечение: ${draft.variant.engagement}`,
                        `Знания: ${draft.variant.knowledge}`,
                        `Персона: ${draft.variant.persona}`,
                        `Оценка: ${draft.variant.evaluation}`,
                        `Вес A/B: ${draft.variant.weight}`,
                      ]}
                    />
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pending || changes.length === 0}
                    onClick={applyDraft}
                  >
                    <IconDeviceFloppy data-icon="inline-start" />
                    Проверил — применить всё
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={rejectDraft}
                  >
                    Отклонить черновик
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
