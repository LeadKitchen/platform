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
  IconArrowsSort,
  IconBook2,
  IconBrain,
  IconBulb,
  IconChartBar,
  IconChefHat,
  IconClipboardList,
  IconDatabase,
  IconInnerShadowTop,
  IconListDetails,
  IconMessages,
  IconRefresh,
  IconReportAnalytics,
  IconScale,
  IconSchool,
  IconSettings,
  IconShieldLock,
  IconSparkles,
  IconUsers,
  IconUsersGroup,
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
      title: "Технологии ИИ",
      url: "/docs/ai",
      icon: IconBrain,
      items: [
        {
          title: "Обзор",
          url: "/docs/ai",
          icon: IconBrain,
          exact: true,
        },
        { title: "HyDE", url: "/docs/ai/hyde", icon: IconBulb },
        {
          title: "Contextual Retrieval",
          url: "/docs/ai/contextual-retrieval",
          icon: IconDatabase,
        },
        {
          title: "Reranking",
          url: "/docs/ai/reranking",
          icon: IconArrowsSort,
        },
        { title: "CRAG", url: "/docs/ai/crag", icon: IconRefresh },
        {
          title: "Self-Consistency",
          url: "/docs/ai/self-consistency",
          icon: IconUsersGroup,
        },
        {
          title: "Debate Judge",
          url: "/docs/ai/debate-judge",
          icon: IconScale,
        },
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
          title: "Лаборатория персонажей",
          url: "/admin/game/characters",
          icon: IconSparkles,
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
          title: "Отчёты о качестве",
          url: "/admin/game/benchmarks",
          icon: IconReportAnalytics,
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
        {
          title: "Документация",
          url: "/admin/docs",
          icon: IconBook2,
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
  adminRole,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar: string };
  adminRole?: "admin" | "methodologist" | "facilitator";
}) {
  const navMain = data.navMain
    .filter((item) => adminRole || item.url !== "/admin/game/overview")
    .map((item) => {
      if (item.url !== "/admin/game/overview" || !adminRole) return item;
      const allowed = new Set(
        adminRole === "admin"
          ? item.items?.map((subItem) => subItem.url)
          : adminRole === "methodologist"
            ? [
                "/admin/game/overview",
                "/admin/game/sessions",
                "/admin/game/dialogs",
                "/admin/game/employees",
                "/admin/game/characters",
                "/admin/game/tasks",
                "/admin/game/variants",
                "/admin/game/benchmarks",
                "/admin/game/settings",
                "/admin/docs",
              ]
            : [
                "/admin/game/overview",
                "/admin/game/sessions",
                "/admin/game/dialogs",
                "/admin/docs",
              ],
      );
      return {
        ...item,
        items: item.items?.filter((subItem) => allowed.has(subItem.url)),
      };
    });

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
