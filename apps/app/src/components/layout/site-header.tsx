"use client";

import { SidebarTrigger } from "@acme/ui";

interface SiteHeaderProps {
  title?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

/** Compact product header: sidebar control plus the current location. */
export function SiteHeader({
  title = "Деловая игра",
  breadcrumbs,
}: SiteHeaderProps) {
  const currentTitle = breadcrumbs?.at(-1)?.label ?? title;

  return (
    <header className="bg-card sticky top-0 z-20 flex h-[52px] shrink-0 items-center border-b px-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="text-muted-foreground -ml-1 size-7 hover:text-foreground" />
        <span className="truncate text-sm font-medium">{currentTitle}</span>
      </div>
    </header>
  );
}
