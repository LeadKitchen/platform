"use client";

import type { RouterOutputs } from "@acme/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@acme/ui";
import {
  IconArrowLeft,
  IconCheck,
  IconEdit,
  IconSearch,
  IconTrash,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { employeeAvatarUri } from "~/lib/avatar";
import { client } from "~/orpc/react";
import { GameSectionHeader } from "./game-section-header";

type CoachingPathDetailOutput = RouterOutputs["org"]["coachingPaths"]["byId"];
export type CoachingMemberView =
  RouterOutputs["org"]["coachingPaths"]["members"][number];
export type CoachingPathAssignmentRow =
  CoachingPathDetailOutput["assignments"][number];
type CoachingPathDetailView = CoachingPathDetailOutput["path"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CoachingPathDetail({
  path,
  assignments,
  members,
}: {
  path: CoachingPathDetailView;
  assignments: CoachingPathAssignmentRow[];
  members: CoachingMemberView[];
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return members;
    return members.filter((member) =>
      `${member.name} ${member.email}`.toLocaleLowerCase("ru").includes(query),
    );
  }, [members, search]);
  const completed = assignments.filter(
    (row) => row.assignment.status === "completed",
  ).length;
  const active = assignments.filter(
    (row) => row.assignment.status === "in_progress",
  ).length;
  const stepCount = path.steps.length;
  const overall =
    assignments.length > 0 && stepCount > 0
      ? Math.round(
          (assignments.reduce(
            (sum, row) =>
              sum + Math.min(row.assignment.currentStep / stepCount, 1),
            0,
          ) /
            assignments.length) *
            100,
        )
      : 0;

  async function assign() {
    if (selected.length === 0 || pending) return;
    setPending(true);
    try {
      const result = await client.org.coachingPaths.assign({
        pathId: path.id,
        participantIds: selected,
      });
      toast.success(
        `Назначено: ${result.assigned}${result.skipped ? ` · уже было: ${result.skipped}` : ""}`,
      );
      setAssignOpen(false);
      setSelected([]);
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось назначить путь",
      );
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    if (pending) return;
    setPending(true);
    try {
      await client.org.coachingPaths.archive({ id: path.id });
      toast.success("Путь перенесён в архив");
      router.push("/game/coaching-paths");
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось архивировать путь",
      );
      setPending(false);
    }
  }

  return (
    <>
      <Link
        href="/game/coaching-paths"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-2 text-sm"
      >
        <IconArrowLeft className="size-4" />К путям обучения
      </Link>
      <GameSectionHeader
        eyebrow="Обучение · Coaching Path"
        title={path.name}
        description={path.description || "Структурированный путь обучения"}
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAssignOpen(true)}>
              <IconUserPlus data-icon="inline-start" />
              Назначить участников
            </Button>
            <Button
              variant="outline"
              render={
                <Link
                  href={{
                    pathname: "/game/coaching-paths",
                    query: { editor: path.id },
                  }}
                />
              }
              nativeButton={false}
            >
              <IconEdit data-icon="inline-start" />К редактору
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Архивировать путь"
              onClick={() => setArchiveOpen(true)}
            >
              <IconTrash />
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Общий прогресс", `${overall}%`, `${assignments.length} участников`],
          [
            "Всего участников",
            String(assignments.length),
            `${completed} завершили, ${active} активны`,
          ],
          [
            "Завершили",
            assignments.length
              ? `${Math.round((completed / assignments.length) * 100)}%`
              : "0%",
            `${completed} из ${assignments.length}`,
          ],
          [
            "Не начали",
            String(
              assignments.filter((row) => row.assignment.status === "assigned")
                .length,
            ),
            `${path.steps.length} шагов`,
          ],
        ].map(([label, value, note]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Путь обучения</CardTitle>
            <CardDescription>
              Последовательность ролевых тренировок и проходные баллы.
            </CardDescription>
          </div>
          <Badge variant="outline">{path.steps.length} шагов</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {path.steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center gap-3 rounded-xl border p-3"
            >
              <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                {index + 1}
              </span>
              <Avatar className="size-11">
                <AvatarImage
                  src={employeeAvatarUri(step.scenario.employeeName)}
                  alt={step.scenario.employeeName}
                />
                <AvatarFallback>
                  {initials(step.scenario.employeeName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {step.scenario.employeeName}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {step.scenario.employeeRole} · {step.scenario.title}
                </p>
              </div>
              <Badge variant="secondary">мин. {step.minScore}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Назначенные участники</CardTitle>
            <CardDescription>
              Баллы по шагам, общий прогресс и текущая тренировка.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {assignments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Участник</TableHead>
                  <TableHead>Баллы по шагам</TableHead>
                  <TableHead className="min-w-40">Прогресс</TableHead>
                  <TableHead>Текущий шаг</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map(({ assignment, participant }) => {
                  const progress =
                    stepCount > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (assignment.currentStep / stepCount) * 100,
                          ),
                        )
                      : 0;
                  return (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-8">
                            <AvatarImage
                              src={participant.image ?? undefined}
                              alt={participant.name}
                            />
                            <AvatarFallback>
                              {initials(participant.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {participant.name}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {participant.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {path.steps.map((step) => {
                            const result = assignment.stepResults
                              .filter((item) => item.stepId === step.id)
                              .at(-1);
                            return (
                              <Badge
                                key={step.id}
                                variant={result?.passed ? "default" : "outline"}
                              >
                                {result ? result.scorePercent : "—"}
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={progress}
                            className="min-w-24 flex-1"
                          />
                          <span className="text-xs tabular-nums">
                            {progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {assignment.status === "completed" ? (
                          <Badge>
                            <IconCheck />
                            Завершён
                          </Badge>
                        ) : (
                          `Шаг ${assignment.currentStep + 1} из ${path.steps.length}`
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconUsers />
                </EmptyMedia>
                <EmptyTitle>Участники ещё не назначены</EmptyTitle>
                <EmptyDescription>
                  Назначьте путь одному или нескольким участникам команды.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Назначить путь участникам</DialogTitle>
            <DialogDescription>
              Выбранные участники получат неизменяемую копию текущей программы.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <IconSearch className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по имени или почте"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Checkbox
              checked={
                filtered.length > 0 &&
                filtered.every((member) => selected.includes(member.id))
              }
              onCheckedChange={(checked) => {
                const filteredIds = new Set(
                  filtered.map((member) => member.id),
                );
                setSelected((current) =>
                  checked
                    ? [...new Set([...current, ...filteredIds])]
                    : current.filter((id) => !filteredIds.has(id)),
                );
              }}
              aria-label="Выбрать всех участников"
            />
            <span className="text-sm font-medium">
              Выбрать всех ({filtered.length})
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {filtered.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg p-2"
              >
                <Checkbox
                  checked={selected.includes(member.id)}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...new Set([...current, member.id])]
                        : current.filter((id) => id !== member.id),
                    )
                  }
                  aria-label={`Выбрать ${member.name}`}
                />
                <Avatar className="size-9">
                  <AvatarImage
                    src={member.image ?? undefined}
                    alt={member.name}
                  />
                  <AvatarFallback>{initials(member.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {member.name}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {member.email}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignOpen(false)}
              disabled={pending}
            >
              Отмена
            </Button>
            <Button
              onClick={assign}
              disabled={pending || selected.length === 0}
            >
              {pending ? "Назначаем…" : `Назначить (${selected.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Архивировать путь?</AlertDialogTitle>
            <AlertDialogDescription>
              Он исчезнет из каталога ведущего. Уже назначенные участникам копии
              и их прогресс сохранятся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={archive}>
              {pending ? "Архивируем…" : "В архив"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
