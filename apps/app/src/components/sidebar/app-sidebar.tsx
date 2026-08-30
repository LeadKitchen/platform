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
  IconBuildingStore,
  IconBulb,
  IconChartBar,
  IconChefHat,
  IconClipboardList,
  IconDatabase,
  IconFileSearch,
  IconGavel,
  IconGitCompare,
  IconInnerShadowTop,
  IconListDetails,
  IconMessages,
  IconRefresh,
  IconReportAnalytics,
  IconRoute,
  IconScale,
  IconSchool,
  IconSettings,
  IconShieldLock,
  IconSparkles,
  IconTargetArrow,
  IconUsers,
  IconUsersGroup,
  IconWand,
} from "@tabler/icons-react";
import type * as React from "react";
import {
  NavMain,
  NavSecondary,
  NavUser,
  type Workspace,
  WorkspaceSwitcher,
} from "~/components/sidebar";

const data = {
  navMain: [
    {
      group: "Практика",
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
        {
          title: "Ролевые диалоги с ИИ",
          url: "/game/roleplay",
          icon: IconMessages,
        },
        {
          title: "Траектории обучения",
          url: "/game/coaching-paths",
          icon: IconRoute,
        },
        {
          title: "Рубрики оценки",
          url: "/game/scorecards",
          icon: IconTargetArrow,
        },
        { title: "Раунд 1 · Теория", url: "/game/round-1", icon: IconSchool },
        { title: "Моя группа", url: "/group", icon: IconUsersGroup },
        {
          title: "Настроить команды",
          url: "/group/configure",
          icon: IconAdjustments,
        },
      ],
    },
    {
      group: "Методология",
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
          title: "LLM Judge",
          url: "/docs/ai/llm-judge",
          icon: IconGavel,
        },
        {
          title: "Debate Judge",
          url: "/docs/ai/debate-judge",
          icon: IconScale,
        },
      ],
    },
    {
      group: "Управление",
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
          title: "Ревью старого проекта",
          url: "/admin/game/reviews",
          icon: IconFileSearch,
        },
        {
          title: "Сравнение с новым проектом",
          url: "/admin/game/comparisons",
          icon: IconGitCompare,
        },
        {
          title: "Организации",
          url: "/admin/game/organizations",
          icon: IconBuildingStore,
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
      group: "Справка",
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
          title: "О продукте",
          url: "/admin/docs/product-overview",
          icon: IconSparkles,
        },
        {
          title: "Игровой процесс",
          url: "/admin/docs/game-flow",
          icon: IconClipboardList,
        },
        {
          title: "Админ-панель",
          url: "/admin/docs/admin-panel",
          icon: IconShieldLock,
        },
        {
          title: "ИИ-помощники",
          url: "/admin/docs/admin-copilots",
          icon: IconWand,
        },
        {
          title: "Роли и доступы",
          url: "/admin/docs/roles-access",
          icon: IconUsers,
        },
        {
          title: "ИИ и качество",
          url: "/admin/docs/ai-quality",
          icon: IconBrain,
        },
        {
          title: "Отчёты и тесты",
          url: "/admin/docs/reports-benchmarks",
          icon: IconReportAnalytics,
        },
        {
          title: "Настройки",
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
  isFacilitator,
  activeWorkspace,
  workspaces,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar: string };
  isAdmin?: boolean;
  isFacilitator?: boolean;
  activeWorkspace?: Workspace;
  workspaces: Workspace[];
}) {
  const navMain = data.navMain
    .filter(
      (item) =>
        isAdmin ||
        (item.url !== "/admin/game/overview" &&
          item.url !== "/admin/docs" &&
          item.url !== "/docs/ai"),
    )
    .map((item) =>
      item.url === "/game" && !isFacilitator
        ? {
            ...item,
            items: item.items.filter(
              (sub) =>
                sub.url !== "/group" &&
                sub.url !== "/group/configure" &&
                sub.url !== "/game/scorecards",
            ),
          }
        : item,
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
              <div className="flex aspect-square size-7 items-center justify-center rounded-[9px] bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
                <IconInnerShadowTop className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">
                  {APP_CONFIG.name}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <WorkspaceSwitcher
              activeWorkspace={activeWorkspace}
              workspaces={workspaces}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/80">
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
