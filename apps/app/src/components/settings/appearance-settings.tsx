"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useTheme,
} from "@acme/ui";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

const modes = [
  { value: "light" as const, label: "Светлая", icon: SunIcon },
  { value: "dark" as const, label: "Тёмная", icon: MoonIcon },
  { value: "auto" as const, label: "Системная", icon: MonitorIcon },
];

export function AppearanceSettings() {
  const { themeMode, setTheme } = useTheme();

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Внешний вид</CardTitle>
        <CardDescription>
          Выберите, как СитРук будет выглядеть на этом устройстве.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-6">
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Тема</span>
          <div className="flex flex-wrap gap-2">
            {modes.map((mode) => (
              <Button
                key={mode.value}
                type="button"
                variant={themeMode === mode.value ? "default" : "secondary"}
                onClick={() => setTheme(mode.value)}
              >
                <mode.icon data-icon="inline-start" />
                {mode.label}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
