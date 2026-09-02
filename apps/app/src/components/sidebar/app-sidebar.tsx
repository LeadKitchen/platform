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
  IconCode,
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
      group: "Игра",
      title: "Деловая игра",
      url: "/game",
      icon: IconListDetails,
      adminOnly: false,
      facilitatorOnly: false,
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
        { title: "Раунд 1 · Теория", url: "/game/round-1", icon: IconSchool },
      ],
    },
    {
      group: "Команда",
      title: "Управление командой",
      url: "/group",
      icon: IconUsersGroup,
      adminOnly: false,
      facilitatorOnly: true,
      items: [
        { title: "Моя группа", url: "/group", icon: IconUsersGroup },
        { title: "Участники", url: "/group/members", icon: IconUsers },
        {
          title: "Настроить команды",
          url: "/group/configure",
          icon: IconAdjustments,
        },
        {
          title: "Рубрики оценки",
          url: "/game/scorecards",
          icon: IconTargetArrow,
        },
      ],
    },
    {
      group: "Методология",
      title: "Технологии ИИ",
      url: "/docs/ai",
      icon: IconBrain,
      adminOnly: true,
      facilitatorOnly: false,
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
      group: "Игровой процесс",
      title: "Игровой процесс (админ)",
      url: "/admin/game/overview",
      icon: IconChartBar,
      adminOnly: true,
      facilitatorOnly: false,
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
          title: "Задания",
          url: "/admin/game/tasks",
          icon: IconAdjustments,
        },
        {
          title: "Настройки игры",
          url: "/admin/game/settings",
          icon: IconSettings,
        },
      ],
    },
    {
      group: "Люди и организации",
      title: "Люди и организации",
      url: "/admin/game/employees",
      icon: IconUsers,
      adminOnly: true,
      facilitatorOnly: false,
      items: [
        {
          title: "Сотрудники",
          url: "/admin/game/employees",
          icon: IconUsers,
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
      ],
    },
    {
      group: "ИИ и качество",
      title: "ИИ и качество (админ)",
      url: "/admin/game/characters",
      icon: IconSparkles,
      adminOnly: true,
      facilitatorOnly: false,
      items: [
        {
          title: "Лаборатория персонажей",
          url: "/admin/game/characters",
          icon: IconSparkles,
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
      ],
    },
    {
      group: "Ревью старого проекта",
      title: "Ревью старого проекта",
      url: "/admin/game/reviews",
      icon: IconFileSearch,
      adminOnly: true,
      facilitatorOnly: false,
      items: [
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
      ],
    },
    {
      group: "О продукте",
      title: "Документация: о продукте",
      url: "/admin/docs",
      icon: IconBook2,
      adminOnly: true,
      facilitatorOnly: false,
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
          title: "Роли и доступы",
          url: "/admin/docs/roles-access",
          icon: IconUsers,
        },
      ],
    },
    {
      group: "Для администраторов",
      title: "Документация: для администраторов",
      url: "/admin/docs/admin-panel",
      icon: IconShieldLock,
      adminOnly: true,
      facilitatorOnly: false,
      items: [
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
          title: "Настройки",
          url: "/admin/docs/settings-integrations",
          icon: IconSettings,
        },
      ],
    },
    {
      group: "Технические детали",
      title: "Документация: технические детали",
      url: "/admin/docs/ai-quality",
      icon: IconCode,
      adminOnly: true,
      facilitatorOnly: false,
      items: [
        {
          title: "ИИ и качество",
          url: "/admin/docs/ai-quality",
          icon: IconBrain,
        },
        {
          title: "Промпты LLM",
          url: "/admin/docs/llm-prompts",
          icon: IconCode,
        },
        {
          title: "Отчёты и тесты",
          url: "/admin/docs/reports-benchmarks",
          icon: IconReportAnalytics,
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
  const navMain = data.navMain.filter(
    (section) =>
      (!section.adminOnly || isAdmin) &&
      (!section.facilitatorOnly || isFacilitator),
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
