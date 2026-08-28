"use client";

import { paths } from "@acme/config";
import { cn } from "@acme/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { title: "Профиль", href: paths.settings.profile },
  { title: "Предпочтения", href: paths.settings.root },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-6 overflow-x-auto border-b" aria-label="Настройки">
      {navigation.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "text-muted-foreground -mb-px shrink-0 border-b-2 border-transparent px-0 py-3 text-sm font-medium transition-colors hover:text-foreground",
              isActive && "border-foreground text-foreground",
            )}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
