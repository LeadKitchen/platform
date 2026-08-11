import type { CriterionId, GameRound, ManagementStyle } from "@acme/game";

/**
 * Labelled scenarios — the ground truth every approach is measured against.
 *
 * Each fixture is a scripted manager, a situation, and an expert verdict. The
 * expert score is the number a facilitator would give the participant; a good
 * approach is one whose automatic score lands close to it *and* whose expected
 * style matches the methodology.
 */
export interface EvalFixture {
  id: string;
  description: string;
  employeeId: string;
  taskId: string;
  round: GameRound;
  activeOrders: number;
  soloOnShift: boolean;
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

export const FIXTURES: EvalFixture[] = [
  {
    id: "anna-pies-delegating",
    description:
      "Эксперт на рутинной задаче, руководитель делегирует — эталонное поведение.",
    employeeId: "anna",
    taskId: "apple_pies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    script: [
      "Анна, нужно 20 порций пирогов с яблоком к 18:00.",
      "Делай как обычно, на твоё усмотрение — не буду вмешиваться.",
    ],
    label: {
      expectedStyle: "delegating",
      actualStyle: "delegating",
      expertScore: 92,
      metCriteria: [
        "clarify_task",
        "set_deadline",
        "delegate_authority",
        "avoid_micromanagement",
      ],
    },
  },
  {
    id: "anna-cake-delegating",
    description:
      "Та же сотрудница, но задача новая и сложная: делегирование ломает заказ.",
    employeeId: "anna",
    taskId: "decorated_cake",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    script: [
      "Анна, нужно сделать торт с украшением к 19:00.",
      "На твоё усмотрение, как обычно — не буду вмешиваться.",
    ],
    label: {
      expectedStyle: "directive",
      actualStyle: "delegating",
      expertScore: 20,
      metCriteria: ["clarify_task", "set_deadline"],
    },
  },
  {
    id: "anna-cake-directive",
    description: "Новая сложная задача, руководитель ведёт директивно.",
    employeeId: "anna",
    taskId: "decorated_cake",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    script: [
      "Анна, нужно сделать торт с украшением к 19:00.",
      "Объясню по шагам: сначала бисквит, потом крем, потом декор по эскизу.",
      "Перед сборкой покажи мне — я проверю. Всё понятно? Повтори, пожалуйста.",
    ],
    label: {
      expectedStyle: "directive",
      actualStyle: "directive",
      expertScore: 90,
      metCriteria: [
        "clarify_task",
        "set_deadline",
        "explain_how",
        "set_checkpoints",
        "check_understanding",
      ],
    },
  },
  {
    id: "anna-pies-micromanaged",
    description:
      "Эксперт на рутинной задаче, руководитель душит контролем — падение мотивации.",
    employeeId: "anna",
    taskId: "apple_pies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    script: [
      "Анна, нужно 20 пирогов к 18:00. Сделай строго по инструкции.",
      "Сначала тесто, потом начинка, я проверю каждые 15 минут. Не отходи от плиты.",
    ],
    label: {
      expectedStyle: "delegating",
      actualStyle: "directive",
      expertScore: 45,
      metCriteria: ["clarify_task", "set_deadline", "explain_how"],
    },
  },
  {
    id: "marina-salads-coaching",
    description: "Сотрудник осваивает задачу: нужен наставнический стиль.",
    employeeId: "marina",
    taskId: "salads",
    round: 2,
    activeOrders: 2,
    soloOnShift: false,
    script: [
      "Марина, нужно 15 порций салатов к открытию.",
      "Объясню по шагам: сначала нарезка, потом заправка перед подачей.",
      "Если что-то непонятно — спрашивай, я рядом. Всё понятно? Ты справишься.",
    ],
    label: {
      expectedStyle: "coaching",
      actualStyle: "coaching",
      expertScore: 88,
      metCriteria: [
        "clarify_task",
        "set_deadline",
        "explain_how",
        "check_understanding",
        "motivate",
      ],
    },
  },
  {
    id: "timur-prep-delegating",
    description:
      "Стажёру делегируют без объяснений — типичная ошибка раунда 2.",
    employeeId: "timur",
    taskId: "prep_veggies",
    round: 2,
    activeOrders: 1,
    soloOnShift: false,
    script: [
      "Тимур, займись заготовками. Сам решай, как удобнее, я не вмешиваюсь.",
    ],
    label: {
      expectedStyle: "directive",
      actualStyle: "delegating",
      expertScore: 15,
      metCriteria: ["clarify_task"],
    },
  },
  {
    id: "igor-solo-priorities",
    description:
      "Раунд 3: один в смене, руководитель расставляет приоритеты и помогает.",
    employeeId: "igor",
    taskId: "banquet_hot",
    round: 3,
    activeOrders: 4,
    soloOnShift: true,
    script: [
      "Игорь, у нас банкет на 40 порций к 20:00, и ты сегодня один.",
      "Сначала банкет, потом стейки — салаты подождут.",
      "Чем помочь? Могу забрать холодный цех на себя. Ты справишься, я рядом.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "supporting",
      expertScore: 85,
      metCriteria: [
        "clarify_task",
        "set_deadline",
        "prioritize",
        "offer_help",
        "motivate",
        "ask_opinion",
      ],
    },
  },
  {
    id: "igor-solo-no-priorities",
    description:
      "Раунд 3: тот же перегруз, но руководитель просто раздаёт задачи.",
    employeeId: "igor",
    taskId: "banquet_hot",
    round: 3,
    activeOrders: 4,
    soloOnShift: true,
    script: [
      "Игорь, банкет на 40 порций, стейки и салаты — всё нужно к 20:00.",
      "Сделай, ты же справлялся раньше. На твоё усмотрение.",
    ],
    label: {
      expectedStyle: "supporting",
      actualStyle: "delegating",
      expertScore: 25,
      metCriteria: ["clarify_task", "set_deadline"],
    },
  },
];
