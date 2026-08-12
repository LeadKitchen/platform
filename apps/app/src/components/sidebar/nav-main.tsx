"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@acme/ui";
import type { Icon } from "@tabler/icons-react";
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function isRouteActive(pathname: string, url: string, exact?: boolean) {
  return pathname === url || (!exact && pathname.startsWith(`${url}/`));
}

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
      icon?: Icon;
      exact?: boolean;
    }[];
  }[];
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Разделы</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isItemActive =
            pathname === item.url ||
            item.items?.some((subItem) =>
              isRouteActive(pathname, subItem.url, subItem.exact),
            );

          return (
            <SidebarMenuItem key={item.title}>
              <Collapsible
                defaultOpen={item.isActive || isItemActive}
                className="group/collapsible"
              >
                <CollapsibleTrigger
                  render={
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isItemActive}
                    />
                  }
                >
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                  <IconChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          render={<Link href={subItem.url} />}
                          isActive={isRouteActive(
                            pathname,
                            subItem.url,
                            subItem.exact,
                          )}
                        >
                          {subItem.icon ? <subItem.icon /> : null}
                          <span>{subItem.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
