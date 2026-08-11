import type { DialogContext, Expectation } from "@acme/game";

import { buildPersonaSystemPrompt, buildTranscript } from "../../prompts";
import { clamp, personaReplySchema } from "../../schemas";
import type {
  PersonaFeedback,
  PersonaRequest,
  PersonaResult,
  PersonaStrategy,
} from "../../types";

/**
 * Skill-based persona policy with a contextual bandit on top.
 *
 * Instead of one monolithic prompt, the character's behaviour is composed from
 * small named skills ("переспроси", "сигнализируй о перегрузе", "сопротивляйся
 * микроменеджменту"). Which skills fire is a *learned* decision: each
 * (context, skill) pair keeps a running value, updated from the reward the
 * caller reports after the dialog ends.
 *
 * The exploration is seeded, so a replay of the same fixture picks the same
 * skills — otherwise A/B numbers would be noise.
 */

export interface Skill {
  id: string;
  instruction: string;
  applies(context: {
    dialog: DialogContext;
    expectation: Expectation;
  }): boolean;
}

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: "ask_clarifying",
    instruction:
      "Если в задаче не хватает деталей (сколько, к какому времени, для кого) — переспроси про самое важное недостающее.",
    applies: () => true,
  },
  {
    id: "surface_uncertainty",
    instruction:
      "Задача для тебя новая: не скрывай неуверенность, но и не проси прямо инструкцию — покажи её через уточняющие вопросы и оговорки.",
    applies: ({ expectation }) => expectation.isNovelTask,
  },
  {
    id: "hint_at_control",
    instruction:
      "Косвенно предложи показать промежуточный результат («показать, когда соберу?»), но не объясняй, зачем это нужно.",
    applies: ({ expectation, dialog }) =>
      expectation.isNovelTask || dialog.task.requiresCheckpoints,
  },
  {
    id: "signal_overload",
    instruction:
      "Скажи, сколько всего на тебе висит прямо сейчас, и что при таком объёме что-то придётся сдвинуть.",
    applies: ({ dialog }) => dialog.shift.load !== "normal",
  },
  {
    id: "propose_compromise",
    instruction:
      "Предложи конкретный компромисс: упростить оформление, перенести менее срочный заказ или позвать помощь.",
    applies: ({ dialog }) => dialog.shift.load === "overload",
  },
  {
    id: "resist_micromanagement",
    instruction:
      "Если руководитель диктует шаги там, где ты и так эксперт, мягко обозначь, что делал это много раз, и что постоянные проверки тебя тормозят.",
    applies: ({ expectation, dialog }) =>
      expectation.competence === "expert" &&
      dialog.employee.personality.reactionToDirective === "resents",
  },
  {
    id: "confirm_and_go",
    instruction:
      "Если задача понятна и она в твоей зоне — коротко подтверди и назови срок, не растягивая разговор.",
    applies: ({ expectation }) =>
      expectation.competence === "expert" ||
      expectation.competence === "capable",
  },
  {
    id: "report_progress",
    instruction:
      "Сообщи, что уже сделано по другим заказам, чтобы руководитель мог расставить приоритеты.",
    applies: ({ dialog }) => dialog.shift.activeOrders > 1,
  },
];

export interface SkillStats {
  value: number;
  count: number;
}

export interface SkillPolicyStore {
  get(key: string): SkillStats | undefined;
  set(key: string, stats: SkillStats): void;
  snapshot(): Record<string, SkillStats>;
  load(snapshot: Record<string, SkillStats>): void;
}

export function createInMemorySkillStore(): SkillPolicyStore {
  const data = new Map<string, SkillStats>();
  return {
    get: (key) => data.get(key),
    set: (key, stats) => {
      data.set(key, stats);
    },
    snapshot: () => Object.fromEntries(data),
    load: (snapshot) => {
      data.clear();
      for (const [key, stats] of Object.entries(snapshot)) data.set(key, stats);
    },
  };
}

function contextKey(request: PersonaRequest): string {
  const { dialog, expectation } = request;
  return [
    expectation.competence,
    dialog.shift.load,
    dialog.shift.soloOnShift ? "solo" : "team",
    dialog.turns.length === 0 ? "opening" : "midway",
  ].join("|");
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Deterministic PRNG so a replayed fixture explores identically. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SkillRlOptions {
  id?: string;
  skills?: Skill[];
  store?: SkillPolicyStore;
  /** Number of skills injected per turn. */
  activeSkills?: number;
  /** Exploration rate. */
  epsilon?: number;
  /** Optimistic initial value: unexplored skills get tried first. */
  initialValue?: number;
}

export function createSkillRlPersona(
  options: SkillRlOptions = {},
): PersonaStrategy {
  const skills = options.skills ?? DEFAULT_SKILLS;
  const store = options.store ?? createInMemorySkillStore();
  const activeSkills = options.activeSkills ?? 3;
  const epsilon = options.epsilon ?? 0.15;
  const initialValue = options.initialValue ?? 0.6;

  function selectSkills(request: PersonaRequest): {
    chosen: Skill[];
    key: string;
  } {
    const key = contextKey(request);
    const candidates = skills.filter((skill) =>
      skill.applies({
        dialog: request.dialog,
        expectation: request.expectation,
      }),
    );

    const random = mulberry32(
      hash(`${key}:${request.dialog.turns.length}:${request.utterance}`),
    );

    const ranked = candidates
      .map((skill) => {
        const stats = store.get(`${key}::${skill.id}`);
        const value = stats?.value ?? initialValue;
        return { skill, score: value + random() * epsilon };
      })
      .sort((a, b) => b.score - a.score);

    return { chosen: ranked.slice(0, activeSkills).map((r) => r.skill), key };
  }

  return {
    id: options.id ?? "skill-rl",
    description:
      "Поведение собирается из именованных навыков; выбор навыков обучается на награде после диалога (контекстный бандит).",

    async respond(request, deps): Promise<PersonaResult> {
      const startedAt = Date.now();
      const { chosen, key } = selectSkills(request);

      const result = await deps.provider.generate({
        purpose: "persona.reply",
        schemaName: "persona_reply",
        schema: personaReplySchema,
        effort: deps.effort,
        system: buildPersonaSystemPrompt({
          dialog: request.dialog,
          knowledge: request.knowledge,
          extraInstructions: chosen.map((skill) => skill.instruction),
        }),
        messages: buildTranscript(request.dialog.turns, request.utterance),
      });

      return {
        reply: {
          silent: false,
          reply: result.value.reply,
          understood: result.value.understood,
          readiness: result.value.readiness,
          requests: result.value.requests,
          confirmsCheckpoints: result.value.confirmsCheckpoints,
          emotionDelta: clamp(result.value.emotionDelta, -2, 2),
        },
        usage: result.usage,
        latencyMs: Date.now() - startedAt,
        meta: {
          contextKey: key,
          skills: chosen.map((skill) => skill.id),
          model: result.model,
        },
      };
    },

    learn(feedback: PersonaFeedback) {
      if (feedback.reward === undefined) return;
      const reward = clamp(feedback.reward, 0, 1);

      for (const meta of feedback.turnMeta) {
        const key = meta.contextKey;
        const used = meta.skills;
        if (typeof key !== "string" || !Array.isArray(used)) continue;

        for (const skillId of used) {
          if (typeof skillId !== "string") continue;
          const storeKey = `${key}::${skillId}`;
          const current = store.get(storeKey) ?? {
            value: initialValue,
            count: 0,
          };
          const count = current.count + 1;
          store.set(storeKey, {
            count,
            value: current.value + (reward - current.value) / count,
          });
        }
      }
    },
  };
}

/** Default instance registered in the strategy registry. */
export const skillRlPersona = createSkillRlPersona();
