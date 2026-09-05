/**
 * Deterministic, dependency-free analysis of the manager's speech.
 *
 * These heuristics are the *baseline*: they always run, they cost nothing, and
 * they make the whole pipeline testable offline. LLM-based strategies in
 * `@acme/ai` can override or blend with them — the eval harness exists exactly
 * to tell whether doing so actually improves the score quality.
 */

import { CRITERIA } from "./criteria";
import { rx } from "./regex";
import { emptyStyleDistribution, normalizeStyleDistribution } from "./styles";
import type {
  CriterionId,
  DialogTurn,
  ManagementStyle,
  StyleDistribution,
} from "./types";

interface StyleMarker {
  style: ManagementStyle;
  pattern: RegExp;
  weight: number;
}

const STYLE_MARKERS: StyleMarker[] = [
  // Directive: orders, exact steps, control points, no room for discussion.
  { style: "directive", pattern: rx("\\bсделай\\b"), weight: 2 },
  { style: "directive", pattern: rx("\\bстрого\\b"), weight: 2 },
  { style: "directive", pattern: rx("\\bпо инструкции\\b"), weight: 2 },
  {
    style: "directive",
    pattern: rx("\\bшаг\\s*\\d|\\bпо шагам\\b"),
    weight: 2,
  },
  { style: "directive", pattern: rx("\\bпокаж(и|у)\\b"), weight: 1 },
  {
    style: "directive",
    pattern: rx("\\bпроверю\\b|\\bпроконтролирую\\b"),
    weight: 2,
  },
  {
    style: "directive",
    pattern: rx("\\bне отходи\\b|\\bбез самодеятельности\\b"),
    weight: 2,
  },
  { style: "directive", pattern: rx("\\bсначала\\b.*\\bпотом\\b"), weight: 1 },

  // Coaching: explains and teaches, but still checks.
  { style: "coaching", pattern: rx("\\bобъясн(ю|и|им)\\b"), weight: 2 },
  {
    style: "coaching",
    pattern: rx("\\bразбер[её]м\\b|\\bпокажу как\\b"),
    weight: 2,
  },
  { style: "coaching", pattern: rx("\\bпочему\\b.*\\bважно\\b"), weight: 1 },
  { style: "coaching", pattern: rx("\\bдавай вместе\\b"), weight: 2 },
  {
    style: "coaching",
    pattern: rx("\\bесли что[- ]?то непонятно\\b"),
    weight: 1,
  },
  {
    style: "coaching",
    pattern: rx("\\bнаучу\\b|\\bпотренируемся\\b"),
    weight: 2,
  },

  // Supporting: asks, listens, encourages, offers help.
  {
    style: "supporting",
    pattern: rx("\\bкак ты счита(ешь|ете)\\b"),
    weight: 2,
  },
  { style: "supporting", pattern: rx("\\bтво[её] мнение\\b"), weight: 2 },
  {
    style: "supporting",
    pattern: rx("\\bчем помочь\\b|\\bнужна помощь\\b"),
    weight: 2,
  },
  {
    style: "supporting",
    pattern: rx("\\bя рядом\\b|\\bподстрахую\\b"),
    weight: 2,
  },
  {
    style: "supporting",
    pattern: rx("\\bты справишься\\b|\\bверю в тебя\\b"),
    weight: 2,
  },
  { style: "supporting", pattern: rx("\\bчто думаешь\\b"), weight: 2 },

  // Delegating: hands over the outcome and steps back.
  {
    style: "delegating",
    pattern: rx("\\bна тво[ёе] усмотрение\\b"),
    weight: 3,
  },
  {
    style: "delegating",
    pattern: rx("\\bсам[аи]? реш(и|ай|ишь)\\b"),
    weight: 3,
  },
  {
    style: "delegating",
    pattern: rx("\\bбер[её]шь на себя\\b|\\bпод твою ответственность\\b"),
    weight: 3,
  },
  { style: "delegating", pattern: rx("\\bкак обычно\\b"), weight: 2 },
  {
    style: "delegating",
    pattern: rx(
      "\\bне буду вмешиваться\\b|\\bне вмешиваюсь\\b|\\bне контролирую\\b",
    ),
    weight: 3,
  },
  {
    style: "delegating",
    pattern: rx("\\bдоверяю\\b|\\bтебе видней\\b"),
    weight: 2,
  },
];

interface RawStyleScores {
  scores: StyleDistribution;
  hits: number;
}

function rawStyleScores(text: string): RawStyleScores {
  const scores = emptyStyleDistribution();
  let hits = 0;

  for (const marker of STYLE_MARKERS) {
    if (marker.pattern.test(text)) {
      scores[marker.style] += marker.weight;
      hits += 1;
    }
  }

  return { scores, hits };
}

/**
 * Fallback when no marker fired at all: a question reads as supporting,
 * a plain statement as directive.
 */
function applyFallback(text: string, scores: StyleDistribution): void {
  if (/\?/.test(text)) scores.supporting += 1;
  else if (/[.!]/.test(text)) scores.directive += 1;
  else scores.coaching += 1;
}

/** Classify a single manager utterance into a style distribution. */
export function classifyStyle(text: string): StyleDistribution {
  const { scores, hits } = rawStyleScores(text);
  if (hits === 0) applyFallback(text, scores);
  return normalizeStyleDistribution(scores);
}

/**
 * Classify the manager's half of a dialog as a whole.
 *
 * Marker weights are accumulated across turns *before* normalising, so a
 * neutral bookkeeping line ("Так, что там по банкету") cannot outvote an
 * explicit "на твоё усмотрение" the way per-turn averaging would.
 */
export function classifyDialogStyle(turns: DialogTurn[]): StyleDistribution {
  const managerTurns = turns.filter((turn) => turn.role === "manager");
  if (managerTurns.length === 0) return emptyStyleDistribution();

  const totals = emptyStyleDistribution();
  let hits = 0;

  for (const turn of managerTurns) {
    const raw = rawStyleScores(turn.text);
    hits += raw.hits;
    for (const style of Object.keys(totals) as ManagementStyle[]) {
      totals[style] += raw.scores[style];
    }
  }

  if (hits === 0) {
    applyFallback(managerTurns.map((turn) => turn.text).join(" "), totals);
  }

  return normalizeStyleDistribution(totals);
}

const CRITERION_MARKERS: Record<CriterionId, RegExp[]> = {
  clarify_task: [
    rx("\\bнужно\\b|\\bзадача\\b|\\bприготов(ь|ить)\\b|\\bсдела(й|ть|ешь)\\b"),
    rx("\\d+\\s*(порц|шт|кг|торт|пирог)"),
  ],
  set_deadline: [
    rx("\\bк\\s*\\d{1,2}[:.]\\d{2}\\b"),
    rx("\\bчерез\\s*\\d+\\s*(минут|час)"),
    rx("\\bдо\\s*\\d{1,2}[:.]\\d{2}\\b"),
    rx(
      "\\bсрок\\b|\\bуспе(ть|ешь)\\b|\\bк открытию\\b|\\bк\\s*\\d{1,2}\\s*часам\\b",
    ),
  ],
  explain_how: [
    rx("\\bобъясн[\\p{L}]*"),
    rx("\\bпокажу как\\b|\\bпо шагам\\b|\\bсначала\\b.*\\bпотом\\b"),
    rx("\\bтехнологическ[\\p{L}]+ карт[\\p{L}]+"),
    rx("\\bрецепт\\b"),
  ],
  set_checkpoints: [
    rx("\\bпроверю\\b|\\bпокажешь\\b|\\bподойд[уи]\\b"),
    rx("\\bточк[\\p{L}]+ контрол[\\p{L}]+|\\bчек[- ]?поинт"),
    rx("\\bперед\\s+[\\p{L}]+\\s+покажи\\b"),
    rx("\\bдержи меня в курсе\\b|\\bсообщи когда\\b"),
  ],
  check_understanding: [
    rx("\\bвс[её] понятно\\b|\\bпонятно\\?"),
    rx("\\bповтори\\b|\\bкак понял[аи]?\\b"),
    rx("\\bесть вопросы\\b"),
  ],
  motivate: [
    rx("\\bты справишься\\b|\\bверю в тебя\\b|\\bмолодец\\b"),
    rx("\\bспасибо\\b|\\bценю\\b|\\bотличная работа\\b"),
    rx("\\bне переживай\\b|\\bспокойно\\b"),
  ],
  ask_opinion: [
    rx("\\bкак ты счита(ешь|ете)\\b|\\bтво[её] мнение\\b|\\bчто думаешь\\b"),
    rx("\\bкак лучше\\b|\\bкак предлага(ешь|ете)\\b"),
  ],
  offer_help: [
    rx("\\bчем помочь\\b|\\bнужна помощь\\b|\\bподстрахую\\b"),
    rx("\\bпозов[уи]\\b|\\bдам помощник[\\p{L}]*"),
    rx("\\bесли что\\b.*\\bобраща(йся|йтесь)\\b"),
  ],
  delegate_authority: [
    rx("\\bна тво[ёе] усмотрение\\b|\\bсам[аи]? реш(и|ай|ишь)\\b"),
    rx("\\bбер[её]шь на себя\\b|\\bпод твою ответственность\\b"),
    rx("\\bдоверяю\\b|\\bтебе видней\\b"),
  ],
  avoid_micromanagement: [
    rx("\\bне буду вмешиваться\\b|\\bне буду стоять над душой\\b"),
    rx("\\bработай как привык(ла)?\\b|\\bкак обычно\\b"),
  ],
  prioritize: [
    rx("\\bсначала\\b.*\\bпотом\\b"),
    rx("\\bв первую очередь\\b|\\bприоритет\\b"),
    rx("\\bотлож(и|им)\\b|\\bподожд[её]т\\b"),
  ],
  reduce_scope: [
    rx("\\bупрост(и|им)\\b|\\bбез украшени[\\p{L}]+"),
    rx("\\bсним(у|ем)\\b.*\\b(заказ|нагрузк)[\\p{L}]*"),
    rx("\\bперенес([её]м|у)\\b|\\bотдам друг[\\p{L}]+"),
  ],
};

const MICROMANAGEMENT = rx(
  "\\bпроверю каждые\\b|\\bне отходи\\b|\\bбуду стоять\\b|\\bкаждые \\d+ минут\\b",
);

/** Which criteria the manager visibly covered in this dialog. */
export function detectCriteria(turns: DialogTurn[]): Set<CriterionId> {
  const managerText = turns
    .filter((turn) => turn.role === "manager")
    .map((turn) => turn.text)
    .join("\n");

  const met = new Set<CriterionId>();
  for (const id of Object.keys(CRITERIA) as CriterionId[]) {
    const markers = CRITERION_MARKERS[id];
    if (markers.some((pattern) => pattern.test(managerText))) met.add(id);
  }

  // Micromanagement is the absence of a behaviour, not its presence: if the
  // manager never dictated every step or announced constant checks, it holds.
  if (MICROMANAGEMENT.test(managerText)) met.delete("avoid_micromanagement");
  else met.add("avoid_micromanagement");

  return met;
}

const TOXIC_MARKERS = rx(
  "\\b(идиот|дура|дурак|тупиц[\\p{L}]*|бездарь|ничтожество|заткнись|урод[\\p{L}]*)\\b",
);

/** Cheap guardrail used both for scoring penalties and content safety. */
export function detectToxicity(text: string): boolean {
  return TOXIC_MARKERS.test(text);
}
