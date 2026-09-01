import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import { IconDevices } from "@tabler/icons-react";

export function SessionsSection() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Сессии</CardTitle>
        <CardDescription>
          Устройства, на которых выполнен вход в ваш аккаунт.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <IconDevices className="text-muted-foreground size-8" />
        <p className="max-w-sm text-sm font-medium">
          Скоро: список активных сессий
        </p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Здесь появится список устройств с активным входом и возможность
          завершить любую сессию удалённо.
        </p>
      </CardContent>
    </Card>
  );
}
