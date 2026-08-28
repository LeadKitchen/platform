import type { ReactNode } from "react";
import { SiteHeader } from "~/components/layout";
import { SettingsSidebar } from "./settings-sidebar";

export function SettingsPageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader title="Аккаунт" />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div className="max-w-5xl space-y-1">
          <h1 className="text-3xl font-medium tracking-[-0.035em]">Аккаунт</h1>
          <p className="text-muted-foreground text-sm">
            Управляйте профилем, языком и внешним видом приложения.
          </p>
        </div>
        <div className="max-w-5xl">
          <SettingsSidebar />
        </div>
        <div className="flex max-w-5xl flex-col gap-6">{children}</div>
      </div>
    </>
  );
}
