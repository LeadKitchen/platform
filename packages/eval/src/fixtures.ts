import type { CriterionId, GameRound, ManagementStyle } from "@acme/game";

/**
 * Labelled scenarios — the ground truth every approach is measured against.
 *
 * Each fixture is a scripted manager, a situation, and an expert verdict. A
 * good approach is one whose automatic score lands close to the expert's *and*
 * whose expected style matches the methodology.
 *
 * Two tiers, curated by hand out of a larger generated pool (see
 * `gen-fixtures.ts`, which still produces the full combinatorial set if the
 * pool ever needs to grow again):
 *
 * - `CORE_FIXTURES` (exported as `FIXTURES`, the default for every run) —
 *   one scenario per (expected style × match/extreme-mismatch), round 2 and
 *   round 3 where the methodology allows it. This is the minimum needed to
 *   catch "the approach ignores the required style" and "the approach cannot
 *   tell overload from normal load" — the two failure modes the game is
 *   actually built to catch. Two of the twelve are also the toxic-turn cases,
 *   so toxicity handling is covered without spending a dedicated scenario.
 * - `EXTENDED_FIXTURES` — the "one step off" arms (over/under-manage by a
 *   single level) that CORE_FIXTURES deliberately drops. They matter for
 *   telling apart the partial-credit table in `styleCredit` (0.4/0.6/0.15/0.3)
 *   but not for a quick regression check — pull them in with `ALL_FIXTURES`
 *   before shipping a technique, not for everyday iteration.
 *
 * Labels start `provisional` (a placeholder calibration formula, see
 * `gen-fixtures.ts`'s `provisionalScore`) and move to `ai-assisted` or
 * `expert` via `export-for-labeling.ts` + `import-labels.ts` as a model or
 * a methodologist reviews scenarios blind — see those two files and the
 * `labelSource` doc comment below for what each tier is actually worth.
 *
 * Regenerate the full pool with `bun run gen-fixtures.ts` after changing the
 * catalog, then re-pick CORE_FIXTURES / EXTENDED_FIXTURES by hand — the
 * selection is a methodology call, not something to automate away.
 */
export interface EvalFixture {
  id: string;
  description: string;
  employeeId: string;
  taskId: string;
  round: GameRound;
  activeOrders: number;
  soloOnShift: boolean;
  /**
   * Where the label came from.
   *
   * `provisional` labels are a placeholder calibration formula (see
   * `gen-fixtures.ts`'s `provisionalScore`), not a considered judgement at
   * all. `ai-assisted` is a model's own read of the script — useful as a
   * starting draft, but it must not be trusted as ground truth: the model
   * being graded here and the model doing the grading share the same failure
   * modes, so an ai-assisted label can silently agree with a bad approach for
   * the same reason the approach is bad. Only `expert` — a human
   * methodologist's verdict, made blind to what the pipeline expected or
   * scored (see `export-for-labeling.ts`) — is strong enough to justify
   * adopting an approach; the report says so out loud for anything less.
   */
  labelSource: "provisional" | "ai-assisted" | "expert";
  /** What the participant says, turn by turn. */
  script: string[];
  label: {
    /** Style the methodology requires in this situation. */
    expectedStyle: ManagementStyle;
    /** Style the scripted manager actually used. */
    actualStyle: ManagementStyle;
    /** Expert score, 0–100. */
    expertScore: number;
    /** Managerial actions an expert would tick off. */
    metCriteria: CriterionId[];
  };
}

/** Utterance used to check the "employee stays silent" requirement. */
export const SILENCE_PROBE =
  "Так, посмотрим, что там у нас по заказам на вечер";

/** Core set — default for every eval run. See file header for the selection rationale. */
export const CORE_FIXTURES: EvalFixture[] = [
  {
    id: "anna-apple_pies-r2-delegating",
    description:
      "Анна Соколова, «Пироги с яблоком, 20 порций», раунд 2: руководитель ведёт delegating, ожидается delegating",
    employeeId: "anna",
    taskId: "apple_pies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно пироги с яблоком, 20 порций к 18:00.",
      "На твоё усмотрение, как обычно — доверяю.",
      "Не буду вмешиваться, работай как привыкла.",
    ],
    label: {
      expectedStyle: "delegating",
      actualStyle: "delegating",
      expertScore: 88,
      metCriteria: [
        "avoid_micromanagement",
        "clarify_task",
        "delegate_authority",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-apple_pies-r2-directive",
    description:
      "Анна Соколова, «Пироги с яблоком, 20 порций», раунд 2: руководитель ведёт directive, ожидается delegating",
    employeeId: "anna",
    taskId: "apple_pies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно пироги с яблоком, 20 порций к 20:00.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Перед подачей покажи мне — я проверю.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
    ],
    label: {
      expectedStyle: "delegating",
      actualStyle: "directive",
      expertScore: 22,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "set_checkpoints",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-salads-r2-coaching",
    description:
      "Анна Соколова, «Салаты дня, 15 порций», раунд 2: руководитель ведёт coaching, ожидается coaching",
    employeeId: "anna",
    taskId: "salads",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно салаты дня, 15 порций к 20:00.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
    ],
    label: {
      expectedStyle: "coaching",
      actualStyle: "coaching",
      expertScore: 85,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "motivate",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-salads-r2-delegating",
    description:
      "Анна Соколова, «Салаты дня, 15 порций», раунд 2: руководитель ведёт delegating, ожидается coaching",
    employeeId: "anna",
    taskId: "salads",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно салаты дня, 15 порций к 18:00.",
      "На твоё усмотрение, как обычно — доверяю.",
      "Не буду вмешиваться, работай как привыкла.",
    ],
    label: {
      expectedStyle: "coaching",
      actualStyle: "delegating",
      expertScore: 10,
      metCriteria: [
        "avoid_micromanagement",
        "clarify_task",
        "delegate_authority",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-banquet_hot-r2-directive",
    description:
      "Анна Соколова, «Горячее на банкет, 40 порций», раунд 2: руководитель ведёт directive, ожидается directive",
    employeeId: "anna",
    taskId: "banquet_hot",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно горячее на банкет, 40 порций к 18:00.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Перед подачей покажи мне — я проверю.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
    ],
    label: {
      expectedStyle: "directive",
      actualStyle: "directive",
      expertScore: 90,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "set_checkpoints",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-banquet_hot-r2-delegating",
    description:
      "Анна Соколова, «Горячее на банкет, 40 порций», раунд 2: руководитель ведёт delegating, ожидается directive",
    employeeId: "anna",
    taskId: "banquet_hot",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно горячее на банкет, 40 порций к 20:00.",
      "На твоё усмотрение, как обычно — доверяю.",
      "Не буду вмешиваться, работай как привыкла.",
      "Ты вообще думаешь головой? Бездарь, сколько можно объяснять.",
    ],
    label: {
      expectedStyle: "directive",
      actualStyle: "delegating",
      expertScore: 3,
      metCriteria: [
        "avoid_micromanagement",
        "clarify_task",
        "delegate_authority",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-prep_veggies-r2-supporting",
    description:
      "Анна Соколова, «Заготовка овощей на смену», раунд 2: руководитель ведёт supporting, ожидается supporting",
    employeeId: "anna",
    taskId: "prep_veggies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно заготовка овощей на смену к 18:00.",
      "Как ты считаешь, успеем к 18:00? Что думаешь по подаче?",
      "Чем помочь? Могу забрать остальные заказы на себя.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "supporting",
      expertScore: 87,
      metCriteria: [
        "ask_opinion",
        "clarify_task",
        "motivate",
        "offer_help",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-prep_veggies-r2-directive",
    description:
      "Анна Соколова, «Заготовка овощей на смену», раунд 2: руководитель ведёт directive, ожидается supporting",
    employeeId: "anna",
    taskId: "prep_veggies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно заготовка овощей на смену к 17:30.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Перед подачей покажи мне — я проверю.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "directive",
      expertScore: 18,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "set_checkpoints",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-apple_pies-r3-supporting",
    description:
      "Анна Соколова, «Пироги с яблоком, 20 порций», раунд 3 (перегруз): руководитель ведёт supporting, ожидается supporting",
    employeeId: "anna",
    taskId: "apple_pies",
    round: 3,
    activeOrders: 4,
    soloOnShift: true,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно пироги с яблоком, 20 порций к 17:30.",
      "Как ты считаешь, успеем к 17:30? Что думаешь по подаче?",
      "Чем помочь? Могу забрать остальные заказы на себя.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
      "Сначала пироги с яблоком, 20 порций, потом остальное — остальные заказы подождёт.",
      "Давай упростим: без украшения, перенесём часть на завтра.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "supporting",
      expertScore: 90,
      metCriteria: [
        "ask_opinion",
        "clarify_task",
        "motivate",
        "offer_help",
        "prioritize",
        "reduce_scope",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-apple_pies-r3-delegating",
    description:
      "Анна Соколова, «Пироги с яблоком, 20 порций», раунд 3 (перегруз): руководитель ведёт delegating, ожидается supporting",
    employeeId: "anna",
    taskId: "apple_pies",
    round: 3,
    activeOrders: 4,
    soloOnShift: true,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно пироги с яблоком, 20 порций к 18:00.",
      "На твоё усмотрение, как обычно — доверяю.",
      "Не буду вмешиваться, работай как привыкла.",
      "Ты вообще думаешь головой? Бездарь, сколько можно объяснять.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "delegating",
      expertScore: 3,
      metCriteria: [
        "avoid_micromanagement",
        "clarify_task",
        "delegate_authority",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-salads-r3-coaching",
    description:
      "Анна Соколова, «Салаты дня, 15 порций», раунд 3 (перегруз): руководитель ведёт coaching, ожидается coaching",
    employeeId: "anna",
    taskId: "salads",
    round: 3,
    activeOrders: 4,
    soloOnShift: true,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно салаты дня, 15 порций к 19:00.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
      "Сначала салаты дня, 15 порций, потом остальное — остальные заказы подождёт.",
      "Давай упростим: без украшения, перенесём часть на завтра.",
    ],
    label: {
      expectedStyle: "coaching",
      actualStyle: "coaching",
      expertScore: 85,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "motivate",
        "prioritize",
        "reduce_scope",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-banquet_hot-r3-directive",
    description:
      "Анна Соколова, «Горячее на банкет, 40 порций», раунд 3 (перегруз): руководитель ведёт directive, ожидается directive",
    employeeId: "anna",
    taskId: "banquet_hot",
    round: 3,
    activeOrders: 4,
    soloOnShift: true,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно горячее на банкет, 40 порций к 17:30.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Перед подачей покажи мне — я проверю.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
      "Сначала горячее на банкет, 40 порций, потом остальное — остальные заказы подождёт.",
      "Давай упростим: без украшения, перенесём часть на завтра.",
    ],
    label: {
      expectedStyle: "directive",
      actualStyle: "directive",
      expertScore: 87,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "prioritize",
        "reduce_scope",
        "set_checkpoints",
        "set_deadline",
      ],
    },
  },
];

/** One-step-off arms — pull in via ALL_FIXTURES before a ship decision. */
export const EXTENDED_FIXTURES: EvalFixture[] = [
  {
    id: "anna-apple_pies-r2-supporting",
    description:
      "Анна Соколова, «Пироги с яблоком, 20 порций», раунд 2: руководитель ведёт supporting, ожидается delegating",
    employeeId: "anna",
    taskId: "apple_pies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно пироги с яблоком, 20 порций к 19:00.",
      "Как ты считаешь, успеем к 19:00? Что думаешь по подаче?",
      "Чем помочь? Могу забрать остальные заказы на себя.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
    ],
    label: {
      expectedStyle: "delegating",
      actualStyle: "supporting",
      expertScore: 78,
      metCriteria: [
        "ask_opinion",
        "clarify_task",
        "motivate",
        "offer_help",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-salads-r2-directive",
    description:
      "Анна Соколова, «Салаты дня, 15 порций», раунд 2: руководитель ведёт directive, ожидается coaching",
    employeeId: "anna",
    taskId: "salads",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно салаты дня, 15 порций к 17:30.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Перед подачей покажи мне — я проверю.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
    ],
    label: {
      expectedStyle: "coaching",
      actualStyle: "directive",
      expertScore: 60,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "set_checkpoints",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-salads-r2-supporting",
    description:
      "Анна Соколова, «Салаты дня, 15 порций», раунд 2: руководитель ведёт supporting, ожидается coaching",
    employeeId: "anna",
    taskId: "salads",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно салаты дня, 15 порций к 21:00.",
      "Как ты считаешь, успеем к 21:00? Что думаешь по подаче?",
      "Чем помочь? Могу забрать остальные заказы на себя.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
    ],
    label: {
      expectedStyle: "coaching",
      actualStyle: "supporting",
      expertScore: 25,
      metCriteria: [
        "ask_opinion",
        "clarify_task",
        "motivate",
        "offer_help",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-banquet_hot-r2-coaching",
    description:
      "Анна Соколова, «Горячее на банкет, 40 порций», раунд 2: руководитель ведёт coaching, ожидается directive",
    employeeId: "anna",
    taskId: "banquet_hot",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно горячее на банкет, 40 порций к 19:00.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
    ],
    label: {
      expectedStyle: "directive",
      actualStyle: "coaching",
      expertScore: 58,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "motivate",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-prep_veggies-r2-coaching",
    description:
      "Анна Соколова, «Заготовка овощей на смену», раунд 2: руководитель ведёт coaching, ожидается supporting",
    employeeId: "anna",
    taskId: "prep_veggies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно заготовка овощей на смену к 19:00.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "coaching",
      expertScore: 35,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "motivate",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-prep_veggies-r2-delegating",
    description:
      "Анна Соколова, «Заготовка овощей на смену», раунд 2: руководитель ведёт delegating, ожидается supporting",
    employeeId: "anna",
    taskId: "prep_veggies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно заготовка овощей на смену к 20:00.",
      "На твоё усмотрение, как обычно — доверяю.",
      "Не буду вмешиваться, работай как привыкла.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "delegating",
      expertScore: 92,
      metCriteria: [
        "avoid_micromanagement",
        "clarify_task",
        "delegate_authority",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-apple_pies-r3-coaching",
    description:
      "Анна Соколова, «Пироги с яблоком, 20 порций», раунд 3 (перегруз): руководитель ведёт coaching, ожидается supporting",
    employeeId: "anna",
    taskId: "apple_pies",
    round: 3,
    activeOrders: 4,
    soloOnShift: true,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно пироги с яблоком, 20 порций к 21:00.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "coaching",
      expertScore: 25,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "motivate",
        "set_deadline",
      ],
    },
  },
  {
    id: "anna-banquet_hot-r3-coaching",
    description:
      "Анна Соколова, «Горячее на банкет, 40 порций», раунд 3 (перегруз): руководитель ведёт coaching, ожидается directive",
    employeeId: "anna",
    taskId: "banquet_hot",
    round: 3,
    activeOrders: 4,
    soloOnShift: true,
    labelSource: "ai-assisted",
    script: [
      "Анна, нужно горячее на банкет, 40 порций к 21:00.",
      "Объясню по шагам: сначала заготовка, потом основная часть, потом подача.",
      "Всё понятно? Повтори, пожалуйста, как поняла задачу.",
      "Ты справишься, я рядом. Спасибо, что взялась.",
    ],
    label: {
      expectedStyle: "directive",
      actualStyle: "coaching",
      expertScore: 20,
      metCriteria: [
        "check_understanding",
        "clarify_task",
        "explain_how",
        "motivate",
        "set_deadline",
      ],
    },
  },
];

export const ALL_FIXTURES: EvalFixture[] = [
  ...CORE_FIXTURES,
  ...EXTENDED_FIXTURES,
];

/** Default export used by the runner and CLI. */
export const FIXTURES: EvalFixture[] = CORE_FIXTURES;
