"use client";

import { APP_CONFIG, paths } from "@acme/config";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@acme/ui";
import {
  IconAdjustments,
  IconBrain,
  IconChartBar,
  IconChefHat,
  IconClipboardList,
  IconInnerShadowTop,
  IconListDetails,
  IconMessages,
  IconSchool,
  IconSettings,
  IconShieldLock,
  IconUsers,
} from "@tabler/icons-react";
import type * as React from "react";
import { NavMain, NavSecondary, NavUser } from "~/components/sidebar";

const data = {
  navMain: [
    {
      title: "Деловая игра",
      url: "/game",
      icon: IconListDetails,
      isActive: true,
      items: [
        {
          title: "Главная игры",
          url: "/game",
          icon: IconChefHat,
          exact: true,
        },
        { title: "Раунд 1 · Теория", url: "/game/round-1", icon: IconSchool },
      ],
    },
    {
      title: "Администрирование",
      url: "/admin/game/overview",
      icon: IconShieldLock,
      items: [
        {
          title: "Обзор",
          url: "/admin/game/overview",
          icon: IconChartBar,
        },
        {
          title: "Сессии",
          url: "/admin/game/sessions",
          icon: IconClipboardList,
        },
        {
          title: "Диалоги",
          url: "/admin/game/dialogs",
          icon: IconMessages,
        },
        {
          title: "Сотрудники",
          url: "/admin/game/employees",
          icon: IconUsers,
        },
        {
          title: "Задания",
          url: "/admin/game/tasks",
          icon: IconAdjustments,
        },
        {
          title: "Варианты ИИ",
          url: "/admin/game/variants",
          icon: IconBrain,
        },
        {
          title: "Пользователи",
          url: "/admin/game/users",
          icon: IconUsers,
        },
        {
          title: "Настройки игры",
          url: "/admin/game/settings",
          icon: IconSettings,
        },
      ],
    },
  ],
  navSecondary: [
    { title: "Настройки", url: paths.settings.root, icon: IconSettings },
  ],
};

export function AppSidebar({
  user,
  isAdmin,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar: string };
  isAdmin: boolean;
}) {
  const navMain = data.navMain.filter(
    (item) => isAdmin || item.url !== "/admin/game/overview",
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<a href={paths.dashboard.root} />}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <IconInnerShadowTop className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {APP_CONFIG.name}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
