import type { RouterOutputs } from "@acme/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@acme/ui";
import {
  IconArchive,
  IconDots,
  IconEdit,
  IconHistory,
  IconPlayerPlay,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { CharacterAvatar } from "~/components/game/character-avatar";
import { employeeAvatarUri } from "~/lib/avatar";

export type RoleplayCategory =
  | "tasking"
  | "feedback"
  | "resistance"
  | "overload"
  | "delegation";
export type EmployeeLevel = "L1" | "L2" | "L3" | "L4";

export const CATEGORY_LABELS: Record<RoleplayCategory, string> = {
  tasking: "Постановка задачи",
  feedback: "Обратная связь",
  resistance: "Сопротивление",
  overload: "Перегруз",
  delegation: "Делегирование",
};

export const LEVEL_LABELS: Record<EmployeeLevel, string> = {
  L1: "L1 · новичок",
  L2: "L2 · осваивает",
  L3: "L3 · способен",
  L4: "L4 · эксперт",
};

const CATEGORY_ACCENT: Record<RoleplayCategory, string> = {
  tasking: "from-chart-1/25 via-muted to-chart-1/5",
  feedback: "from-chart-2/25 via-muted to-chart-2/5",
  resistance: "from-chart-3/25 via-muted to-chart-3/5",
  overload: "from-chart-4/25 via-muted to-chart-4/5",
  delegation: "from-chart-5/25 via-muted to-chart-5/5",
};

export function attemptLabel(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? "попыток"
      : lastDigit === 1
        ? "попытка"
        : lastDigit >= 2 && lastDigit <= 4
          ? "попытки"
          : "попыток";
  return `${count} ${suffix}`;
}

export type ScenarioView =
  RouterOutputs["game"]["roleplay"]["list"]["scenarios"][number];

export function ScenarioCard({
  scenario,
  attemptCount,
  mutationPending,
  onToggleFavorite,
  onEdit,
  onArchive,
  onDetails,
  onStart,
}: {
  scenario: ScenarioView;
  attemptCount: number;
  mutationPending: boolean;
  onToggleFavorite: (scenario: ScenarioView) => void;
  onEdit: (scenario: ScenarioView) => void;
  onArchive: (scenario: ScenarioView) => void;
  onDetails: (scenario: ScenarioView) => void;
  onStart: (scenario: ScenarioView) => void;
}) {
  return (
    <Card className="overflow-hidden py-0">
      <div
        className={`flex h-28 items-end bg-gradient-to-br p-4 ${CATEGORY_ACCENT[scenario.category]}`}
      >
        <CharacterAvatar
          className="size-12 border-2 border-background"
          src={employeeAvatarUri(scenario.employeeName, {
            id: scenario.baseEmployeeId,
            gender: scenario.employeeGender,
          })}
          name={scenario.employeeName}
        />
        <div className="ml-auto flex gap-1">
          {scenario.source === "custom" ? (
            <Button
              variant="outline"
              size="icon"
              aria-label={
                scenario.isFavorite
                  ? "Убрать из избранного"
                  : "Добавить в избранное"
              }
              disabled={mutationPending}
              onClick={() => onToggleFavorite(scenario)}
            >
              {scenario.isFavorite ? <IconStarFilled /> : <IconStar />}
            </Button>
          ) : null}
          {scenario.source === "custom" ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Действия со сценарием"
                  />
                }
              >
                <IconDots />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onEdit(scenario)}>
                    <IconEdit />
                    Редактировать
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onArchive(scenario)}
                  >
                    <IconArchive />В архив
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate text-base">
            {scenario.employeeName}
          </CardTitle>
          <CardDescription className="truncate">
            {scenario.employeeRole}
          </CardDescription>
        </div>
        <Badge variant="outline">{scenario.employeeLevel}</Badge>
      </CardHeader>
      <CardContent className="flex min-h-48 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {CATEGORY_LABELS[scenario.category]}
          </Badge>
          {scenario.source === "custom" ? (
            <Badge variant="outline">Мой сценарий</Badge>
          ) : null}
        </div>
        <div>
          <p className="font-medium">{scenario.title}</p>
          <p className="text-muted-foreground mt-1 line-clamp-4 text-sm leading-5">
            {scenario.description}
          </p>
        </div>
        <div className="text-muted-foreground mt-auto flex items-center gap-1.5 text-xs">
          <IconHistory className="size-4" />
          {attemptLabel(attemptCount)}
        </div>
      </CardContent>
      <CardFooter className="border-t py-4">
        <Button variant="ghost" size="sm" onClick={() => onDetails(scenario)}>
          Подробнее
        </Button>
        <Button size="sm" onClick={() => onStart(scenario)}>
          <IconPlayerPlay data-icon="inline-start" />
          Начать
        </Button>
      </CardFooter>
    </Card>
  );
}
