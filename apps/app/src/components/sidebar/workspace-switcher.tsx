"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  SidebarMenuButton,
} from "@acme/ui";
import {
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { client } from "~/orpc/react";

export interface Workspace {
  id: string;
  name: string;
  isFacilitator: boolean;
}

interface WorkspaceSwitcherProps {
  activeWorkspace?: Workspace;
  workspaces: Workspace[];
}

/** Kendo-style workspace picker, kept in the sidebar where context changes. */
export function WorkspaceSwitcher({
  activeWorkspace,
  workspaces,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const nameInputId = useId();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  async function selectWorkspace(orgId: string) {
    if (orgId === activeWorkspace?.id || pending) return;
    setPending(true);
    try {
      await client.org.workspace.select({ orgId });
      router.push("/game");
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось сменить команду",
      );
    } finally {
      setPending(false);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    try {
      await client.org.workspace.create({ name, description });
      setName("");
      setDescription("");
      setIsCreateOpen(false);
      router.push("/game");
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Не удалось создать команду",
      );
    } finally {
      setPending(false);
    }
  }

  const workspaceName = activeWorkspace?.name ?? "Моя команда";
  const workspaceInitial = workspaceName.trim().charAt(0).toUpperCase() || "К";

  function openCreateWorkspace() {
    setIsCreateOpen(true);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              size="lg"
              tooltip="Выбрать команду"
              className="h-10 border border-sidebar-border/70 bg-card px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.025)] hover:bg-sidebar-accent"
            />
          }
        >
          <div className="bg-brand-soft text-brand flex aspect-square size-6 items-center justify-center rounded-md text-xs font-semibold">
            {workspaceInitial}
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{workspaceName}</span>
          </div>
          <IconChevronDown className="text-muted-foreground ml-auto size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start" side="right">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Ваши команды</DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                disabled={pending}
                onClick={() => selectWorkspace(workspace.id)}
              >
                <IconUsersGroup />
                <span className="min-w-0 flex-1 truncate">
                  {workspace.name}
                </span>
                {workspace.id === activeWorkspace?.id ? (
                  <IconCheck className="text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openCreateWorkspace}>
            <IconPlus />
            Создать команду
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <IconUsersGroup className="size-5" />
            <DialogTitle className="text-2xl">
              Создать новую команду
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={createWorkspace} className="flex flex-col gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={nameInputId}>Название команды</FieldLabel>
                <Input
                  id={nameInputId}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Например, Команда продаж"
                  minLength={2}
                  maxLength={128}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${nameInputId}-description`}>
                  Описание{" "}
                  <span className="text-muted-foreground">(необязательно)</span>
                </FieldLabel>
                <Input
                  id={`${nameInputId}-description`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Коротко о команде"
                  maxLength={256}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Создаём…" : "Создать команду"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
