import { z } from "zod";

export const competenceStateSchema = z.enum([
  "novice",
  "learning",
  "capable",
  "expert",
]);

const shortList = z.array(z.string().trim().min(2).max(160)).min(1).max(6);

export const employeePersonalitySchema = z.object({
  tone: z.enum(["confident", "anxious", "independent"]),
  reactionToDirective: z.enum(["accepts", "neutral", "resents"]),
  reactionToSupport: z.enum(["needs", "neutral", "dislikes"]),
  typicalErrors: shortList,
  motivators: shortList,
  demotivators: shortList,
  biography: z.string().trim().min(10).max(600).optional(),
  communicationStyle: z.string().trim().min(5).max(300).optional(),
  stressBehavior: z.string().trim().min(5).max(300).optional(),
  speechPatterns: shortList.optional(),
  boundaries: shortList.optional(),
});

export const employeeProfileSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(128),
  role: z.string().trim().min(2).max(128),
  level: z.enum(["L1", "L2", "L3", "L4"]),
  competences: z.record(z.string(), competenceStateSchema),
  personality: employeePersonalitySchema,
});

const immersivePersonalitySchema = employeePersonalitySchema.extend({
  biography: z.string().trim().min(30).max(600),
  communicationStyle: z.string().trim().min(10).max(300),
  stressBehavior: z.string().trim().min(10).max(300),
  speechPatterns: z.array(z.string().trim().min(2).max(160)).min(2).max(6),
  boundaries: z.array(z.string().trim().min(2).max(160)).min(1).max(6),
});

export const characterDraftSchema = z.object({
  profile: employeeProfileSchema.extend({
    personality: immersivePersonalitySchema,
  }),
  designIntent: z.string().trim().min(20).max(600),
  preview: z.object({
    normal: z.string().trim().min(10).max(500),
    underPressure: z.string().trim().min(10).max(500),
    afterSupport: z.string().trim().min(10).max(500),
  }),
});

export const characterRosterDraftSchema = z.object({
  teamName: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(20).max(800),
  characters: z.array(characterDraftSchema).min(1).max(5),
  warnings: z.array(z.string().trim().min(2).max(300)).max(10),
});

export type CharacterDraft = z.infer<typeof characterDraftSchema>;
export type CharacterRosterDraft = z.infer<typeof characterRosterDraftSchema>;

export interface CharacterQualityCheck {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  detail: string;
}

export interface CharacterQuality {
  characterId: string;
  score: number;
  ready: boolean;
  checks: CharacterQualityCheck[];
}

export interface RosterQuality {
  score: number;
  ready: boolean;
  characters: CharacterQuality[];
  blockers: string[];
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

const UNSAFE_CHARACTER_CONTENT =
  /ignore (?:all |previous )?instructions|system prompt|игнорир[а-яё]* (?:все |предыдущ[а-яё]* )?инструкц|системн[а-яё]* промпт|стил[а-яё]* управлен|уров[а-яё]* готовност|директивн[а-яё]* стил|делегирующ[а-яё]* стил|ты (?:ии|ассистент)/i;

export function evaluateCharacterRoster(
  draft: CharacterRosterDraft,
  context: {
    taskTypes: string[];
    existingIds: string[];
    existingNames: string[];
  },
): RosterQuality {
  const taskTypes = new Set(context.taskTypes);
  const existingIds = new Set(context.existingIds);
  const existingNames = new Set(context.existingNames.map(normalized));
  const draftIdCounts = new Map<string, number>();
  const draftNameCounts = new Map<string, number>();
  for (const character of draft.characters) {
    const { id, name } = character.profile;
    draftIdCounts.set(id, (draftIdCounts.get(id) ?? 0) + 1);
    const normalizedName = normalized(name);
    draftNameCounts.set(
      normalizedName,
      (draftNameCounts.get(normalizedName) ?? 0) + 1,
    );
  }

  const blockers: string[] = [];
  const characters = draft.characters.map((character): CharacterQuality => {
    const profile = character.profile;
    const competenceTypes = Object.keys(profile.competences).filter((type) =>
      taskTypes.has(type),
    );
    const competenceRange = new Set(Object.values(profile.competences)).size;
    const duplicate =
      existingIds.has(profile.id) ||
      existingNames.has(normalized(profile.name)) ||
      (draftIdCounts.get(profile.id) ?? 0) > 1 ||
      (draftNameCounts.get(normalized(profile.name)) ?? 0) > 1;
    const previews = Object.values(character.preview).map(normalized);
    const distinctPreviews = new Set(previews).size === previews.length;
    const personality = profile.personality;
    const safeContent = !UNSAFE_CHARACTER_CONTENT.test(
      JSON.stringify(character),
    );

    const checks: CharacterQualityCheck[] = [
      {
        id: "unique",
        label: "Уникальный персонаж",
        passed: !duplicate,
        weight: 20,
        detail: duplicate
          ? "ID или имя уже используются в каталоге либо повторяются в наборе."
          : "ID и имя не конфликтуют с каталогом.",
      },
      {
        id: "task-coverage",
        label: "Покрытие игровых задач",
        passed:
          competenceTypes.length >= Math.min(2, Math.max(1, taskTypes.size)),
        weight: 20,
        detail: `${competenceTypes.length} типов задач связаны с компетенциями персонажа.`,
      },
      {
        id: "competence-contrast",
        label: "Контраст готовности",
        passed: competenceRange >= 2,
        weight: 15,
        detail:
          competenceRange >= 2
            ? "Персонаж ведёт себя по-разному в знакомых и новых задачах."
            : "Все компетенции одинаковы — учебные ситуации будут однообразными.",
      },
      {
        id: "behavior-depth",
        label: "Глубина поведения",
        passed:
          personality.typicalErrors.length >= 2 &&
          personality.motivators.length >= 2 &&
          personality.demotivators.length >= 2,
        weight: 15,
        detail: "Проверены ошибки, мотиваторы и демотиваторы.",
      },
      {
        id: "voice",
        label: "Узнаваемый голос",
        passed:
          (personality.speechPatterns?.length ?? 0) >= 2 &&
          Boolean(personality.communicationStyle),
        weight: 10,
        detail: `${personality.speechPatterns?.length ?? 0} характерных речевых паттерна.`,
      },
      {
        id: "stress",
        label: "Поведение под нагрузкой",
        passed: Boolean(personality.stressBehavior),
        weight: 5,
        detail: personality.stressBehavior
          ? "Реакция на давление задана."
          : "Не описана реакция на давление.",
      },
      {
        id: "preview",
        label: "Синтетический прогон",
        passed: distinctPreviews,
        weight: 10,
        detail: distinctPreviews
          ? "Три контрольные ситуации дают разные реплики."
          : "Пробные реплики слишком похожи друг на друга.",
      },
      {
        id: "prompt-safety",
        label: "Безопасность роли",
        passed: safeContent,
        weight: 5,
        detail: safeContent
          ? "Нет инструкций для обхода роли и подсказок методологии."
          : "Найдена попытка изменить системные правила или раскрыть методологию.",
      },
    ];
    const score = checks.reduce(
      (sum, check) => sum + (check.passed ? check.weight : 0),
      0,
    );
    if (duplicate) {
      blockers.push(`${profile.name}: конфликт ID или имени.`);
    }
    if (competenceTypes.length === 0) {
      blockers.push(`${profile.name}: нет компетенций для текущих заданий.`);
    }
    if (!safeContent) {
      blockers.push(
        `${profile.name}: профиль не прошёл проверку безопасности.`,
      );
    }
    return {
      characterId: profile.id,
      score,
      ready: score >= 80 && !duplicate && competenceTypes.length > 0,
      checks,
    };
  });

  const score =
    characters.length === 0
      ? 0
      : Math.round(
          characters.reduce((sum, character) => sum + character.score, 0) /
            characters.length,
        );
  return {
    score,
    ready: blockers.length === 0 && characters.every((item) => item.ready),
    characters,
    blockers,
  };
}
