"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@acme/ui";
import type { NotificationPreferences } from "@acme/validators";
import {
  IconBell,
  IconDevices,
  IconShieldLock,
  IconUserCircle,
} from "@tabler/icons-react";
import { AppearanceSettings } from "./appearance-settings";
import { NotificationPreferencesForm } from "./notification-preferences-form";
import { ProfileSection } from "./profile-section";
import { SecuritySection } from "./security-section";
import { SessionsSection } from "./sessions-section";

export function AccountTabs({
  profile,
  notificationPreferences,
}: {
  profile: {
    name: string;
    username: string;
    email: string;
    bio: string;
    language: string;
  };
  notificationPreferences: NotificationPreferences;
}) {
  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">
          <IconUserCircle data-icon="inline-start" />
          Профиль
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <IconBell data-icon="inline-start" />
          Уведомления
        </TabsTrigger>
        <TabsTrigger value="security">
          <IconShieldLock data-icon="inline-start" />
          Безопасность
        </TabsTrigger>
        <TabsTrigger value="sessions">
          <IconDevices data-icon="inline-start" />
          Сессии
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="flex flex-col gap-6 pt-6">
        <ProfileSection initialData={profile} />
        <AppearanceSettings />
      </TabsContent>

      <TabsContent value="notifications" className="pt-6">
        <NotificationPreferencesForm initialData={notificationPreferences} />
      </TabsContent>

      <TabsContent value="security" className="pt-6">
        <SecuritySection />
      </TabsContent>

      <TabsContent value="sessions" className="pt-6">
        <SessionsSection />
      </TabsContent>
    </Tabs>
  );
}
