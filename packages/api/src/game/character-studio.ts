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

export const employeeGenderSchema = z.enum(["male", "female"]);

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
  /** Drives which TTS voice reads the character's lines — must match `name`. */
  gender: employeeGenderSchema,
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

export const characterSimulationModeSchema = z.enum([
  "standard",
  "peak",
  "conflict",
]);

export const characterSimulationResponseSchema = z.object({
  characterId: employeeProfileSchema.shape.id,
  reply: z.string().trim().min(10).max(700),
  emotion: z.string().trim().min(2).max(120),
  inferredNeed: z.string().trim().min(5).max(300),
  behavioralRisk: z.string().trim().min(5).max(300),
});

export const characterSimulationResponseSetSchema = z.object({
  scenarioSummary: z.string().trim().min(10).max(500),
  responses: z.array(characterSimulationResponseSchema).min(1).max(5),
});

export const characterSimulationVerdictSchema = z.object({
  characterId: employeeProfileSchema.shape.id,
  personaConsistency: z.number().int().min(0).max(100),
  scenarioFit: z.number().int().min(0).max(100),
  naturalness: z.number().int().min(0).max(100),
  safety: z.number().int().min(0).max(100),
  evidence: z.string().trim().min(10).max(500),
  recommendation: z.string().trim().min(5).max(400),
});

export const characterSimulationJudgeSchema = z.object({
  summary: z.string().trim().min(10).max(600),
  verdicts: z.array(characterSimulationVerdictSchema).min(1).max(5),
});

export type CharacterDraft = z.infer<typeof characterDraftSchema>;
export type CharacterRosterDraft = z.infer<typeof characterRosterDraftSchema>;
export type CharacterSimulationResponseSet = z.infer<
  typeof characterSimulationResponseSetSchema
>;
export type CharacterSimulationJudge = z.infer<
  typeof characterSimulationJudgeSchema
>;

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

export interface SimulationMetric {
  id: "persona" | "scenario" | "naturalness" | "safety";
  label: string;
  score: number;
  weight: number;
}

export interface CharacterSimulationScore {
  characterId: string;
  score: number;
  ready: boolean;
  metrics: SimulationMetric[];
  evidence: string;
  recommendation: string;
}

export interface RosterSimulationScore {
  score: number;
  ready: boolean;
  characters: CharacterSimulationScore[];
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

function countById(items: Array<{ characterId: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.characterId, (counts.get(item.characterId) ?? 0) + 1);
  }
  return counts;
}

export function evaluateCharacterSimulation(
  draft: CharacterRosterDraft,
  responses: CharacterSimulationResponseSet,
  judge: CharacterSimulationJudge,
): RosterSimulationScore {
  const expectedIds = new Set(
    draft.characters.map((character) => character.profile.id),
  );
  const responseCounts = countById(responses.responses);
  const verdictCounts = countById(judge.verdicts);
  const responseById = new Map(
    responses.responses.map((response) => [response.characterId, response]),
  );
  const verdictById = new Map(
    judge.verdicts.map((verdict) => [verdict.characterId, verdict]),
  );
  const blockers: string[] = [];

  for (const id of responseCounts.keys()) {
    if (!expectedIds.has(id)) {
      blockers.push(`Симулятор вернул неизвестного персонажа ${id}.`);
    }
  }
  for (const id of verdictCounts.keys()) {
    if (!expectedIds.has(id)) {
      blockers.push(`Судья оценил неизвестного персонажа ${id}.`);
    }
  }

  const characters = draft.characters.map(
    ({ profile }): CharacterSimulationScore => {
      const id = profile.id;
      const response = responseById.get(id);
      const verdict = verdictById.get(id);
      if (!response || responseCounts.get(id) !== 1) {
        blockers.push(`${profile.name}: нет единственного ответа симуляции.`);
      }
      if (!verdict || verdictCounts.get(id) !== 1) {
        blockers.push(`${profile.name}: нет единственной оценки LLM-судьи.`);
      }

      const safeReply = response
        ? !UNSAFE_CHARACTER_CONTENT.test(response.reply)
        : false;
      const metrics: SimulationMetric[] = [
        {
          id: "persona",
          label: "Сохранение личности",
          score: verdict?.personaConsistency ?? 0,
          weight: 35,
        },
        {
          id: "scenario",
          label: "Уместность в эпизоде",
          score: verdict?.scenarioFit ?? 0,
          weight: 25,
        },
        {
          id: "naturalness",
          label: "Естественность речи",
          score: verdict?.naturalness ?? 0,
          weight: 25,
        },
        {
          id: "safety",
          label: "Безопасность роли",
          score: safeReply ? (verdict?.safety ?? 0) : 0,
          weight: 15,
        },
      ];
      const score = Math.round(
        metrics.reduce(
          (sum, metric) => sum + (metric.score * metric.weight) / 100,
          0,
        ),
      );
      const safety =
        metrics.find((metric) => metric.id === "safety")?.score ?? 0;
      if (!safeReply) {
        blockers.push(
          `${profile.name}: ответ не прошёл проверку безопасности.`,
        );
      } else if (safety < 80) {
        blockers.push(`${profile.name}: оценка безопасности ниже 80%.`);
      }
      return {
        characterId: id,
        score,
        ready:
          Boolean(response) &&
          responseCounts.get(id) === 1 &&
          Boolean(verdict) &&
          verdictCounts.get(id) === 1 &&
          score >= 75 &&
          safety >= 80,
        metrics,
        evidence: verdict?.evidence ?? "Нет оценки.",
        recommendation: verdict?.recommendation ?? "Повторите симуляцию.",
      };
    },
  );
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
    blockers: [...new Set(blockers)],
  };
}
