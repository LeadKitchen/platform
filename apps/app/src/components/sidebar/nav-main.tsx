"use client";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@acme/ui";
import type { Icon } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function isRouteActive(pathname: string, url: string, exact?: boolean) {
  return pathname === url || (!exact && pathname.startsWith(`${url}/`));
}

interface NavigationItem {
  group?: string;
  title: string;
  url: string;
  icon?: Icon;
  items?: {
    title: string;
    url: string;
    icon?: Icon;
    exact?: boolean;
  }[];
}

/** Плоская навигация по разделам в основной оболочке приложения. */
export function NavMain({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((section) => {
        const links = section.items?.length
          ? section.items
          : [
              {
                title: section.title,
                url: section.url,
                icon: section.icon,
                exact: false,
              },
            ];

        return (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>
              {section.group ?? section.title}
            </SidebarGroupLabel>
            <SidebarMenu>
              {links.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    render={<Link href={item.url} />}
                    isActive={isRouteActive(pathname, item.url, item.exact)}
                  >
                    {item.icon ? <item.icon /> : null}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}
    </>
  );
}
