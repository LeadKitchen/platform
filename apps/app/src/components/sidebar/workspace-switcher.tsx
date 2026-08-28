"use client";

import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuContent,
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
      await client.org.workspace.create({ name });
      setName("");
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuButton size="lg" tooltip="Выбрать команду" />}
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
            <IconUsersGroup className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{workspaceName}</span>
            <span className="truncate text-xs text-muted-foreground">
              Команда
            </span>
          </div>
          <IconChevronDown className="ml-auto size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start" side="right">
          <DropdownMenuLabel>Ваши команды</DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              disabled={pending}
              onClick={() => selectWorkspace(workspace.id)}
            >
              <IconUsersGroup />
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              {workspace.id === activeWorkspace?.id ? (
                <IconCheck className="text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsCreateOpen(true)}>
            <IconPlus />
            Создать команду
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Drawer
        direction="right"
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Создать команду</DrawerTitle>
            <DrawerDescription>
              Вы станете ведущим команды и сразу переключитесь на неё.
            </DrawerDescription>
          </DrawerHeader>
          <form onSubmit={createWorkspace}>
            <FieldGroup className="px-4">
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
            </FieldGroup>
            <DrawerFooter>
              <Button type="submit" disabled={pending}>
                <IconPlus data-icon="inline-start" />
                {pending ? "Создаём…" : "Создать команду"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setIsCreateOpen(false)}
              >
                Отмена
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
}
