"use client";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChefHat,
  IconClock,
  IconFlagCheck,
  IconUser,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { client } from "~/orpc/react";
import { TicketIllustration } from "./illustrations";

export interface EmployeeOption {
  id: string;
  name: string;
  role: string;
  levelLabel: string;
}

export interface TaskOption {
  id: string;
  title: string;
  type: string;
  complexity: number;
}

export interface OrderRow {
  id: string;
  taskId: string;
  employeeId: string;
  portions: number;
  deadlineMinutes: number;
  status: string;
  dialogId?: string;
  scorePercent?: number;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "в очереди",
  in_progress: "в работе",
  done: "готов",
  failed: "испорчен",
};

const STATUS_VARIANTS: Record<
  string,
  "outline" | "accent" | "success" | "destructive"
> = {
  queued: "outline",
  in_progress: "accent",
  done: "success",
  failed: "destructive",
};

/**
 * Очередь заказов сессии: распределение заказов по сотрудникам и вход в диалог.
 *
 * Распределение — решение участников; модуль его только фиксирует, а потом
 * оценивает, как этим сотрудником управляли.
 */
export function OrderQueue(props: {
  sessionId: string;
  employees: EmployeeOption[];
  tasks: TaskOption[];
  orders: OrderRow[];
  defaultDeadlineMinutes: number;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(props.employees[0]?.id ?? "");
  const [taskId, setTaskId] = useState(props.tasks[0]?.id ?? "");
  const [portions, setPortions] = useState("1");
  const [deadline, setDeadline] = useState(
    String(props.defaultDeadlineMinutes),
  );
  const [pending, setPending] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employeeById = new Map(props.employees.map((item) => [item.id, item]));
  const taskById = new Map(props.tasks.map((item) => [item.id, item]));
  const selectedEmployee = employeeById.get(employeeId);
  const selectedTask = taskById.get(taskId);

  async function addOrder(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const order = await client.game.order.create({
        sessionId: props.sessionId,
        taskId,
        employeeId,
        portions: Number.parseInt(portions, 10) || 1,
        deadlineMinutes:
          Number.parseInt(deadline, 10) || props.defaultDeadlineMinutes,
      });
      if (!order?.id) throw new Error("Заказ не создан");
      const dialog = await client.game.dialog.start({ orderId: order.id });
      if (!dialog?.id) throw new Error("Диалог не открыт");
      router.push(`/game/dialog/${dialog.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось добавить");
    } finally {
      setPending(false);
    }
  }

  async function openDialog(order: OrderRow) {
    setPending(true);
    setError(null);
    try {
      if (order.dialogId) {
        router.push(`/game/dialog/${order.dialogId}`);
        return;
      }
      const dialog = await client.game.dialog.start({ orderId: order.id });
      router.push(`/game/dialog/${dialog?.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось открыть");
      setPending(false);
    }
  }

  async function endSession() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await client.game.session.end({ id: props.sessionId });
      setFinishOpen(false);
      router.push("/game");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось завершить смену",
      );
      setPending(false);
    }
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Новая рабочая ситуация</CardTitle>
            <CardDescription>
              Сначала выберите задачу и сотрудника. Затем сразу начнётся
              разговор — вы сможете говорить голосом или писать.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Новая ситуация</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setFinishOpen(true)}
            >
              <IconFlagCheck data-icon="inline-start" />
              Завершить смену
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid p-0 xl:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={addOrder}
          className="p-5 sm:p-6 xl:col-start-2 xl:row-start-1"
        >
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="order-task">
                <Badge variant="outline">1</Badge> Что нужно сделать?
              </FieldLabel>
              <Select
                value={taskId}
                onValueChange={(value) => setTaskId(value ?? "")}
              >
                <SelectTrigger id="order-task">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {props.tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Сложность: {selectedTask?.complexity ?? "—"} из 5
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="order-employee">
                <Badge variant="outline">2</Badge> Кто будет выполнять?
              </FieldLabel>
              <Select
                value={employeeId}
                onValueChange={(value) => setEmployeeId(value ?? "")}
              >
                <SelectTrigger id="order-employee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {props.employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name} — {employee.role}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {selectedEmployee?.role ?? "Выберите сотрудника"} · уровень{" "}
                {selectedEmployee?.levelLabel ?? "—"}
              </FieldDescription>
            </Field>

            <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="order-portions">Объём, порций</FieldLabel>
                <Input
                  id="order-portions"
                  value={portions}
                  onChange={(event) => setPortions(event.target.value)}
                  inputMode="numeric"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="order-deadline">Срок, минут</FieldLabel>
                <Input
                  id="order-deadline"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  inputMode="numeric"
                />
              </Field>
            </div>

            <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-4 md:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-background flex size-10 items-center justify-center rounded-lg border">
                  <IconChefHat />
                </div>
                <div>
                  <p className="font-medium">
                    {selectedTask?.title ?? "Задача"} →{" "}
                    {selectedEmployee?.name ?? "сотрудник"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {portions || "1"} порц. · срок{" "}
                    {deadline || props.defaultDeadlineMinutes} мин
                  </p>
                </div>
              </div>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Открываем разговор…" : "Начать разговор"}
                <IconArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </FieldGroup>
        </form>

        {error ? (
          <div className="px-5 pb-5 sm:px-6 xl:col-start-2">
            <Alert variant="destructive">
              <IconAlertTriangle />
              <AlertTitle>Не удалось открыть ситуацию</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-b p-3 xl:col-start-1 xl:row-start-1 xl:min-h-[520px] xl:border-b-0 xl:border-r">
          <div className="px-2 pt-2">
            <h3 className="font-semibold">Ситуации</h3>
            <p className="text-muted-foreground text-sm">
              Выберите разговор или создайте новый.
            </p>
          </div>
          <ul className="flex flex-col gap-1">
            {props.orders.length === 0 ? (
              <li className="text-muted-foreground flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center text-sm">
                <TicketIllustration className="size-12" />
                <span>
                  <span className="text-foreground block font-medium">
                    Ситуаций пока нет
                  </span>
                  Создайте первый разговор с помощью формы.
                </span>
              </li>
            ) : null}

            {props.orders.map((order, index) => (
              <li
                key={order.id}
                className="animate-in fade-in slide-in-from-top-2 hover:bg-muted flex flex-col items-stretch gap-3 rounded-lg px-3 py-3 duration-300"
                style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span className="bg-background flex size-9 shrink-0 items-center justify-center rounded-lg border">
                    <IconUser className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {employeeById.get(order.employeeId)?.name ??
                        order.employeeId}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {taskById.get(order.taskId)?.title ?? order.taskId}
                    </span>
                  </span>
                  {order.scorePercent !== undefined ? (
                    <Badge>{order.scorePercent}%</Badge>
                  ) : (
                    <Badge
                      variant={STATUS_VARIANTS[order.status] ?? "secondary"}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <IconClock className="size-3.5" /> {order.deadlineMinutes}{" "}
                    мин
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {order.portions} порц.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={pending}
                    onClick={() => openDialog(order)}
                  >
                    {order.dialogId ? "Продолжить" : "Открыть"}
                    <IconArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить эту смену?</AlertDialogTitle>
            <AlertDialogDescription>
              Смена исчезнет из активных. История разговоров и результаты
              сохранятся в вашем прогрессе.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Продолжить</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={endSession}>
              {pending ? "Завершаем…" : "Завершить смену"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
