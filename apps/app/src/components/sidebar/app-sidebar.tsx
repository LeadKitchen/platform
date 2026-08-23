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
  IconFileSearch,
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
  IconWand,
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
          title: "Отчёты о ревью",
          url: "/admin/game/reviews",
          icon: IconFileSearch,
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
    {
      title: "Документация",
      url: "/admin/docs",
      icon: IconBook2,
      items: [
        {
          title: "Обзор",
          url: "/admin/docs",
          icon: IconBook2,
          exact: true,
        },
        {
          title: "Что такое продукт",
          url: "/admin/docs/product-overview",
          icon: IconSparkles,
        },
        {
          title: "Как устроена игра для сотрудника",
          url: "/admin/docs/game-flow",
          icon: IconClipboardList,
        },
        {
          title: "Разделы административной панели",
          url: "/admin/docs/admin-panel",
          icon: IconShieldLock,
        },
        {
          title: "ИИ-помощники внутри админ-панели",
          url: "/admin/docs/admin-copilots",
          icon: IconWand,
        },
        {
          title: "Роли и права доступа",
          url: "/admin/docs/roles-access",
          icon: IconUsers,
        },
        {
          title: "Как ИИ понимает контекст и как измеряется качество",
          url: "/admin/docs/ai-quality",
          icon: IconBrain,
        },
        {
          title: "Отчёты о качестве и сравнительные тесты",
          url: "/admin/docs/reports-benchmarks",
          icon: IconReportAnalytics,
        },
        {
          title: "Настройки и техническая эксплуатация",
          url: "/admin/docs/settings-integrations",
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
  isAdmin?: boolean;
}) {
  const navMain = data.navMain.filter(
    (item) =>
      isAdmin ||
      (item.url !== "/admin/game/overview" &&
        item.url !== "/admin/docs" &&
        item.url !== "/docs/ai"),
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
