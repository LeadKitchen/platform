import { type Database, eq, GameSettings } from "@acme/db";

export const DEFAULT_GAME_SETTINGS = {
  id: "global",
  defaultVariantId: null as string | null,
  defaultRound: 2 as 2 | 3,
  defaultDeadlineMinutes: 60,
  allowRoundThree: true,
  maxActiveSessions: 20,
};

export type EffectiveGameSettings = typeof DEFAULT_GAME_SETTINGS & {
  updatedAt?: Date;
};

/** Return persisted settings or safe defaults before the first admin save. */
export async function loadGameSettings(
  db: Database,
): Promise<EffectiveGameSettings> {
  const [settings] = await db
    .select()
    .from(GameSettings)
    .where(eq(GameSettings.id, "global"))
    .limit(1);

  if (!settings) return DEFAULT_GAME_SETTINGS;

  return {
    ...settings,
    defaultRound: settings.defaultRound === 3 ? 3 : 2,
  };
}
