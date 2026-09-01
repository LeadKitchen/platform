import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui";
import { IconShieldLock } from "@tabler/icons-react";

export function SecuritySection() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Безопасность</CardTitle>
        <CardDescription>Пароль, вход и защита аккаунта.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <IconShieldLock className="text-muted-foreground size-8" />
        <p className="max-w-sm text-sm font-medium">
          Скоро: смена пароля и двухфакторная аутентификация
        </p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Здесь появится смена пароля, включение двухфакторной аутентификации и
          история входов в аккаунт.
        </p>
      </CardContent>
    </Card>
  );
}
