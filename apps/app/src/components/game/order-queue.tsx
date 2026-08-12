"use client";

import {
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
        <CardTitle>Начать разговор с сотрудником</CardTitle>
        <CardDescription>
          Выберите рабочую ситуацию. После назначения сразу откроется чат, где
          вы поставите задачу сотруднику голосом или текстом.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <form onSubmit={addOrder}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="order-task">1. Выберите заказ</FieldLabel>
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
                Сложность ситуации зависит от опыта сотрудника в этой задаче.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="order-employee">
                2. Выберите сотрудника
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
                Учитывайте уровень и опыт именно в выбранной задаче.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="order-portions">Порций</FieldLabel>
              <Input
                id="order-portions"
                value={portions}
                onChange={(event) => setPortions(event.target.value)}
                inputMode="numeric"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="order-deadline">Дедлайн, мин</FieldLabel>
              <Input
                id="order-deadline"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                inputMode="numeric"
              />
            </Field>

            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Открываем разговор…" : "Перейти к разговору с ИИ"}
              </Button>
            </div>
          </FieldGroup>
        </form>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <ul className="flex flex-col gap-2">
          {props.orders.length === 0 ? (
            <li className="text-muted-foreground text-sm">Заказов пока нет.</li>
          ) : null}

          {props.orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {taskById.get(order.taskId)?.title ?? order.taskId}
                </span>
                <span className="text-muted-foreground text-sm">
                  →{" "}
                  {employeeById.get(order.employeeId)?.name ?? order.employeeId}
                </span>
                <Badge variant="outline">{order.portions} шт.</Badge>
                <Badge variant="outline">{order.deadlineMinutes} мин</Badge>
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
                Открыть диалог
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
