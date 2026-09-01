"use client";

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui";
import {
  IconDots,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  isFacilitator: boolean;
  isYou: boolean;
  joinedAt: Date | string;
  liveSessions: number;
  roleplaySessions: number;
  lastCallAt: Date | string | null;
  lastRoleplayAt: Date | string | null;
  lastActiveAt: Date | string | null;
  avgScore: number | null;
}

type RoleFilter = "all" | "facilitator" | "member";
type ScoreFilter = "all" | "high" | "mid" | "low" | "none";

function dateLabel(value: Date | string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

function scoreBucket(avgScore: number | null): ScoreFilter {
  if (avgScore === null) return "none";
  if (avgScore >= 80) return "high";
  if (avgScore >= 50) return "mid";
  return "low";
}

/** Add-member dialog: adds an already-registered user to the workspace by email. */
function AddMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const emailInputId = useId();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await client.org.members.add({ email });
      toast.success(`${result.name} добавлен(а) в команду`);
      setEmail("");
      onOpenChange(false);
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Не удалось добавить участника",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <IconUserPlus className="size-5" />
          <DialogTitle className="text-2xl">Добавить участника</DialogTitle>
        </DialogHeader>
        <form onSubmit={addMember} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={emailInputId}>Почта</FieldLabel>
              <Input
                id={emailInputId}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.ru"
                required
              />
              <p className="text-muted-foreground text-sm">
                Пользователь уже должен быть зарегистрирован в системе.
              </p>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Добавляем…" : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageMemberMenu({ member }: { member: MemberRow }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggleFacilitator() {
    if (pending) return;
    setPending(true);
    try {
      await client.org.members.setFacilitator({
        userId: member.userId,
        isFacilitator: !member.isFacilitator,
      });
      toast.success(
        member.isFacilitator
          ? `${member.name} больше не фасилитатор`
          : `${member.name} теперь фасилитатор`,
      );
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось изменить роль",
      );
    } finally {
      setPending(false);
    }
  }

  async function removeMember() {
    if (pending) return;
    setPending(true);
    try {
      await client.org.members.remove({ userId: member.userId });
      toast.success(`${member.name} удалён(а) из команды`);
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось удалить участника",
      );
    } finally {
      setPending(false);
    }
  }

  if (member.isYou) {
    return (
      <Button size="sm" variant="outline" disabled>
        Управлять
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="sm" variant="outline" disabled={pending} />}
      >
        Управлять
        <IconDots data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={pending} onClick={toggleFacilitator}>
          {member.isFacilitator
            ? "Забрать роль фасилитатора"
            : "Назначить фасилитатором"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={removeMember}
        >
          Удалить из команды
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Kendo-style workspace members table: search, filters, and per-row management. */
export function MembersWorkspace({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter((member) => {
      if (
        query &&
        !member.name.toLowerCase().includes(query) &&
        !member.email.toLowerCase().includes(query)
      )
        return false;
      if (roleFilter === "facilitator" && !member.isFacilitator) return false;
      if (roleFilter === "member" && member.isFacilitator) return false;
      if (scoreFilter !== "all" && scoreBucket(member.avgScore) !== scoreFilter)
        return false;
      return true;
    });
  }, [members, search, roleFilter, scoreFilter]);

  function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          Участников в команде:{" "}
          <span className="text-foreground font-medium">{members.length}</span>
        </span>
        <button
          type="button"
          onClick={refresh}
          aria-label="Обновить"
          className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 items-center justify-center rounded-md transition-colors"
        >
          <IconRefresh
            className={refreshing ? "size-4 animate-spin" : "size-4"}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск участников…"
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(value) => setRoleFilter(value as RoleFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Все роли" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все роли</SelectItem>
            <SelectItem value="facilitator">Фасилитаторы</SelectItem>
            <SelectItem value="member">Участники</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={scoreFilter}
          onValueChange={(value) => setScoreFilter(value as ScoreFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Вся результативность" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Вся результативность</SelectItem>
            <SelectItem value="high">Высокая, от 80%</SelectItem>
            <SelectItem value="mid">Средняя, 50–79%</SelectItem>
            <SelectItem value="low">Низкая, до 50%</SelectItem>
            <SelectItem value="none">Ещё нет данных</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setAddOpen(true)} className="ml-auto">
          <IconPlus data-icon="inline-start" />
          Добавить участника
        </Button>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Участник</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Последний звонок</TableHead>
              <TableHead>Последняя ролевая игра</TableHead>
              <TableHead>Последняя активность</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Действия</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground text-center"
                >
                  {members.length === 0
                    ? "В команде пока нет участников."
                    : "Никого не нашлось по заданным условиям."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8 rounded-full">
                        <AvatarFallback className="bg-brand rounded-full text-white">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5 truncate font-medium">
                          {member.name}
                          {member.isYou ? (
                            <Badge variant="outline" className="text-[10px]">
                              вы
                            </Badge>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {member.liveSessions} игр · {member.roleplaySessions}{" "}
                          ролевых · {member.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={member.isFacilitator ? "accent" : "outline"}
                    >
                      {member.isFacilitator ? "Фасилитатор" : "Участник"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {dateLabel(member.lastCallAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dateLabel(member.lastRoleplayAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dateLabel(member.lastActiveAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <ManageMemberMenu member={member} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
