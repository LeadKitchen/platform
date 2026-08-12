/**
 * Generates the expanded fixture set for packages/eval/src/fixtures.ts.
 * Run: bun run <this file> > fixtures.generated.ts
 */

import type { CriterionId, GameRound, ManagementStyle } from "@acme/game";
import {
  defaultCatalog,
  resolveExpectation,
  resolveShiftLoad,
} from "@acme/game";

const STYLES: ManagementStyle[] = [
  "directive",
  "coaching",
  "supporting",
  "delegating",
];

interface Move {
  text: (ctx: Ctx) => string;
  criteria: CriterionId[];
}

interface Ctx {
  name: string;
  task: string;
  time: string;
  other: string;
}

const M: Record<string, Move> = {
  assign: {
    text: (c) => `${c.name}, нужно ${c.task} к ${c.time}.`,
    criteria: ["clarify_task", "set_deadline"],
  },
  explain: {
    text: () =>
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
    criteria: ["explain_how"],
  },
  checkpoint: {
    text: () => "Перед подачей покажи мне — я проверю.",
    criteria: ["set_checkpoints"],
  },
  check: {
    text: () => "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
    criteria: ["check_understanding"],
  },
  motivate: {
    text: () => "Ты справишься, я рядом. Спасибо, что взялась.",
    criteria: ["motivate"],
  },
  askOpinion: {
    text: (c) => `Как ты считаешь, успеем к ${c.time}? Что думаешь по подаче?`,
    criteria: ["ask_opinion"],
  },
  offerHelp: {
    text: (c) => `Чем помочь? Могу забрать ${c.other} на себя.`,
    criteria: ["offer_help"],
  },
  delegate: {
    text: () => "На твоё усмотрение, как обычно — доверяю.",
    criteria: ["delegate_authority", "avoid_micromanagement"],
  },
  stepBack: {
    text: () => "Не буду вмешиваться, работай как привыкла.",
    criteria: ["avoid_micromanagement"],
  },
  prioritize: {
    text: (c) => `Сначала ${c.task}, потом остальное — ${c.other} подождёт.`,
    criteria: ["prioritize"],
  },
  reduceScope: {
    text: () => "Давай упростим: без украшения, перенесём часть на завтра.",
    criteria: ["reduce_scope"],
  },
  micromanage: {
    text: () =>
      "Проверю каждые 15 минут. Не отходи от плиты, строго по инструкции.",
    criteria: ["explain_how"],
  },
  toxic: {
    text: () => "Ты вообще думаешь головой? Бездарь, сколько можно объяснять.",
    criteria: [],
  },
};

/** Which moves a manager playing `style` would make, in order. */
const PLAYBOOK: Record<ManagementStyle, string[]> = {
  directive: ["assign", "explain", "checkpoint", "check"],
  coaching: ["assign", "explain", "check", "motivate"],
  supporting: ["assign", "askOpinion", "offerHelp", "motivate"],
  delegating: ["assign", "delegate", "stepBack"],
};

const TIMES = ["18:00", "19:00", "20:00", "17:30", "21:00"];

interface Spec {
  id: string;
  description: string;
  employeeId: string;
  taskId: string;
  round: GameRound;
  activeOrders: number;
  soloOnShift: boolean;
  script: string[];
  label: {
    expectedStyle: ManagementStyle;
    actualStyle: ManagementStyle;
    expertScore: number;
    metCriteria: CriterionId[];
  };
}

/**
 * Provisional expert score.
 *
 * Deliberately NOT the production formula: a label produced by the code under
 * test would make MAE measure itself. This is a coarse human-style judgement
 * on style fit and coverage, to be replaced by the methodologist's numbers.
 */
function provisionalScore(
  expected: ManagementStyle,
  actual: ManagementStyle,
  coverage: number,
  toxic: boolean,
  overloadHandled: boolean,
): number {
  const gap = STYLES.indexOf(actual) - STYLES.indexOf(expected);
  let base: number;
  if (gap === 0) base = 90;
  else if (gap < 0)
    base = Math.abs(gap) === 1 ? 55 : 35; // over-managing
  else base = Math.abs(gap) === 1 ? 40 : 18; // under-managing: riskier

  base -= Math.round((1 - coverage) * 30);
  if (toxic) base -= 25;
  if (!overloadHandled) base -= 10;
  return Math.max(5, Math.min(97, base));
}

const specs: Spec[] = [];
let index = 0;

for (const employee of defaultCatalog.employees) {
  for (const task of defaultCatalog.tasks) {
    for (const [round, activeOrders, solo] of [
      [2, 1, false],
      [3, 4, true],
    ] as const) {
      const load = resolveShiftLoad(activeOrders, solo);
      const expectation = resolveExpectation(employee, task, {
        round,
        activeOrders,
        soloOnShift: solo,
        load,
      });
      const expected = expectation.expectedStyle;
      const required = new Set(
        expectation.requiredCriteria.map((criterion) => criterion.id),
      );

      // Four arms per situation: play it right, over-manage by one step,
      // under-manage by one step, and the far end of the scale. That last one
      // is the spec's headline example — an expert handed a brand-new task and
      // then left alone — and it is the case that separates a scorer that
      // understands the matrix from one that just matches the employee's level.
      const at = STYLES.indexOf(expected);
      const played: ManagementStyle[] = [
        expected,
        STYLES[Math.max(0, at - 1)] as ManagementStyle,
        STYLES[Math.min(3, at + 1)] as ManagementStyle,
        (at <= 1 ? STYLES[3] : STYLES[0]) as ManagementStyle,
      ];

      const seenArms = new Set<ManagementStyle>();
      for (const [armIndex, actual] of played.entries()) {
        if (armIndex > 0 && actual === expected) continue;
        if (seenArms.has(actual)) continue;
        seenArms.add(actual);

        const ctx: Ctx = {
          name: employee.name.split(" ")[0] ?? employee.name,
          task: task.title.toLowerCase(),
          time: TIMES[index % TIMES.length] ?? "19:00",
          other: "остальные заказы",
        };

        const moves = [...(PLAYBOOK[actual] ?? [])];
        // A correct manager under overload also sets priorities.
        const overloadHandled = load === "overload" ? armIndex === 0 : true;
        if (load === "overload" && armIndex === 0) {
          moves.push("prioritize", "reduceScope");
        }

        const met = new Set<CriterionId>();
        for (const move of moves) {
          for (const criterion of M[move]?.criteria ?? []) met.add(criterion);
        }
        // Only criteria the methodology actually asks for count toward coverage.
        const metRequired = [...met].filter((criterion) =>
          required.has(criterion),
        );
        const coverage =
          required.size === 0 ? 1 : metRequired.length / required.size;

        const toxic = index % 17 === 5;
        const script = moves.map((move) => M[move]?.text(ctx) ?? "");
        if (toxic) script.push(M.toxic?.text(ctx) ?? "");

        specs.push({
          id: `${employee.id}-${task.id}-r${round}-${actual}`,
          description: `${employee.name}, «${task.title}», раунд ${round}${
            load === "overload" ? " (перегруз)" : ""
          }: руководитель ведёт ${actual}, ожидается ${expected}`,
          employeeId: employee.id,
          taskId: task.id,
          round,
          activeOrders,
          soloOnShift: solo,
          script,
          label: {
            expectedStyle: expected,
            actualStyle: actual,
            expertScore: provisionalScore(
              expected,
              actual,
              coverage,
              toxic,
              overloadHandled,
            ),
            metCriteria: metRequired.sort(),
          },
        });
        index += 1;
      }
    }
  }
}

// Balance the confusion matrix, not just the expected style. The cases that
// actually discriminate between approaches are the mismatches — an expert
// under-managed (directive←delegating) or an expert micromanaged
// (delegating←directive) — so every (expected, actual) pair gets a quota
// instead of striding through a list sorted by employee.
const byPair = new Map<string, Spec[]>();
for (const spec of specs) {
  const key = `${spec.label.expectedStyle}<-${spec.label.actualStyle}`;
  const bucket = byPair.get(key) ?? [];
  bucket.push(spec);
  byPair.set(key, bucket);
}

const perPair = 5;
const selected: Spec[] = [];
for (const [, bucket] of [...byPair].sort(([a], [b]) => a.localeCompare(b))) {
  // Interleave rounds inside the quota. Round 3 (solo cook, overload) is a
  // distinct half of the spec, and a naive stride through the bucket returns
  // almost only round 2 — the ordering puts it first for every employee.
  const rounds: Spec[][] = [
    bucket.filter((spec) => spec.round === 2),
    bucket.filter((spec) => spec.round === 3),
  ];
  const cursors = [0, 0];

  for (let taken = 0; taken < perPair; taken += 1) {
    // Alternate, falling back to the other round when one is exhausted.
    const preferred = taken % 2;
    const order = [preferred, 1 - preferred];
    const source = order.find(
      (which) => (cursors[which] ?? 0) < (rounds[which]?.length ?? 0),
    );
    if (source === undefined) break;

    const cursor = cursors[source] ?? 0;
    const item = rounds[source]?.[cursor];
    cursors[source] = cursor + 1;
    if (!item) break;
    selected.push(item);
  }
}
selected.sort((a, b) => a.id.localeCompare(b.id));

console.log(JSON.stringify(selected, null, 2));
console.error(`сгенерировано: ${selected.length} из ${specs.length}`);
const dist = new Map<string, number>();
for (const s of selected) {
  const key = `${s.label.expectedStyle}←${s.label.actualStyle}`;
  dist.set(key, (dist.get(key) ?? 0) + 1);
}
console.error(
  [...dist]
    .sort()
    .map(([k, v]) => `${k}:${v}`)
    .join(" "),
);
console.error(
  "раунды:",
  selected.filter((s) => s.round === 2).length,
  "/",
  selected.filter((s) => s.round === 3).length,
);
