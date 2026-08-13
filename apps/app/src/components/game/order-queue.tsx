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
  IconUser,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { client } from "~/orpc/react";

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
}

const STATUS_LABELS: Record<string, string> = {
  queued: "в очереди",
  in_progress: "в работе",
  done: "готов",
  failed: "испорчен",
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

  async function openDialog(orderId: string) {
    setPending(true);
    setError(null);
    try {
      const dialog = await client.game.dialog.start({ orderId });
      router.push(`/game/dialog/${dialog?.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось открыть");
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Новая рабочая ситуация</CardTitle>
            <CardDescription>
              Сначала выберите задачу и сотрудника. Затем сразу начнётся
              разговор — вы сможете говорить голосом или писать.
            </CardDescription>
          </div>
          <Badge>Следующий шаг</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <form onSubmit={addOrder}>
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
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>Не удалось открыть ситуацию</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3">
          <div>
            <h3 className="font-semibold">Ситуации этой смены</h3>
            <p className="text-muted-foreground text-sm">
              Можно вернуться к любому разговору.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {props.orders.length === 0 ? (
              <li className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                Первая ситуация появится здесь после начала разговора.
              </li>
            ) : null}

            {props.orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <IconUser />
                    {employeeById.get(order.employeeId)?.name ??
                      order.employeeId}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    · {taskById.get(order.taskId)?.title ?? order.taskId}
                  </span>
                  <Badge variant="outline">{order.portions} шт.</Badge>
                  <Badge variant="outline">
                    <IconClock /> {order.deadlineMinutes} мин
                  </Badge>
                  <Badge variant="secondary">
                    {STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => openDialog(order.id)}
                >
                  Продолжить
                  <IconArrowRight data-icon="inline-end" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
