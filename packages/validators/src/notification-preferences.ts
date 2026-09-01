import { z } from "zod";

export const notificationPreferencesSchema = z.object({
  /** Security & sign-in emails. Always on — not part of the editable set. */
  teamInvitesEmail: z.boolean(),
  sessionAnalyticsEmail: z.boolean(),
  sessionAnalysisReadyInApp: z.boolean(),
  reviewRemindersEmail: z.boolean(),
  reviewRemindersInApp: z.boolean(),
  trainingAssignmentsEmail: z.boolean(),
  trainingAssignmentsInApp: z.boolean(),
  actionItemUpdatesEmail: z.boolean(),
  dailyDigestEmail: z.boolean(),
  weeklySummaryEmail: z.boolean(),
});

export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

export const updateNotificationPreferencesSchema =
  notificationPreferencesSchema.partial();

export const defaultNotificationPreferences: NotificationPreferences = {
  teamInvitesEmail: true,
  sessionAnalyticsEmail: true,
  sessionAnalysisReadyInApp: true,
  reviewRemindersEmail: true,
  reviewRemindersInApp: true,
  trainingAssignmentsEmail: true,
  trainingAssignmentsInApp: true,
  actionItemUpdatesEmail: true,
  dailyDigestEmail: false,
  weeklySummaryEmail: true,
};
