import type { EvaluationView } from "./evaluation-card";

/**
 * Одна реплика демо-разговора.
 *
 * `note` появляется под репликой в тонкой строке и объясняет игроку, что
 * именно демонстрирует этот ход — комментарий методолога, а не часть речи.
 */
export interface DemoScriptTurn {
  role: "manager" | "employee";
  text: string;
  note?: string;
}

/**
 * Группа сценариев в переключателе.
 *
 * `correct` — примеры «как надо», один правильный стиль на уровень.
 * `mistakes` — контрастные примеры «как не надо» с теми же сотрудниками.
 * `round3` — усложнённая смена (solo/overload), где методология меняет
 * ожидаемый стиль.
 */
export type DemoScenarioGroup = "correct" | "mistakes" | "round3";

export interface DemoScenario {
  /** Слаг для URL и tab value. */
  id: string;
  group: DemoScenarioGroup;
  /** Короткое название таба (2–4 слова). */
  tabLabel: string;
  /** Ярлык уровня в шапке — "L1", "L2", ... */
  levelBadge: string;
  /** Что показываем этим сценарием — одна строка над разговором. */
  headline: string;
  /** Развёрнутая подводка, отображается перед разговором. */
  intro: string;
  employee: {
    name: string;
    role: string;
    initials: string;
  };
  taskTitle: string;
  shift: {
    round: 2 | 3;
    activeOrders: number;
    soloOnShift: boolean;
  };
  script: DemoScriptTurn[];
  evaluation: EvaluationView;
}

/** Сценарий по умолчанию — открывается, если из URL ничего не пришло. */
export const DEFAULT_DEMO_SCENARIO_ID = "l2-coaching";

/**
 * Полный набор демо-кейсов.
 *
 * Числа в `breakdown` в сумме равны `scorePercent`; веса в
 * `styleDistribution` в сумме равны 1. При правке любого поля держите эти
 * инварианты — карточка разбора рассчитывает шкалы напрямую из значений.
 */
export const DEMO_SCENARIOS: DemoScenario[] = [
  // ────────────────────── ПРАВИЛЬНЫЕ (по уровням) ──────────────────────

  {
    id: "l1-directive",
    group: "correct",
    tabLabel: "L1 · Директивный",
    levelBadge: "L1",
    headline: "Стажёру нужны пошаговые инструкции и контрольная точка",
    intro:
      "Денис впервые на смене. Он не знает, как режется морковь под рагу, и стесняется переспрашивать. Правильный ход — показать, объяснить и договориться о короткой проверке.",
    employee: {
      name: "Денис Волков",
      role: "Стажёр · уровень L1",
      initials: "Д",
    },
    taskTitle: "Заготовка овощей на смену",
    shift: { round: 2, activeOrders: 1, soloOnShift: false },
    script: [
      {
        role: "manager",
        text: "Денис, сегодня твоя первая заготовка овощей. Начнём с моркови — нужны кубики по 5 миллиметров, пойдут в рагу.",
        note: "Обратился по имени, назвал задачу и её назначение — стажёр понимает, зачем это делает.",
      },
      {
        role: "employee",
        text: "Хорошо, готов смотреть.",
      },
      {
        role: "manager",
        text: "Смотри: срезаем шкурку тонко, режем брусочками, потом брусочки на кубики. Держим руку костяшками — нож на пальцы не заходит. Покажи, как берёшь нож.",
        note: "Показал технику и сразу проверил, что сотрудник понял — важное для новичка.",
      },
      {
        role: "employee",
        text: "Костяшками, вот так. А если кубики немного разные — это критично?",
      },
      {
        role: "manager",
        text: "Разброс до миллиметра нормально, больше — уже видно в тарелке. Порежь 4 моркови и покажи мне до того, как двигаться дальше.",
        note: "Назначил контрольную точку. Директивный стиль — это не про давление, а про структуру.",
      },
      {
        role: "employee",
        text: "Понял, 4 морковки — и на проверку.",
      },
    ],
    evaluation: {
      scorePercent: 92,
      expectedStyle: "directive",
      actualStyle: "directive",
      styleDistribution: {
        directive: 0.8,
        coaching: 0.2,
        supporting: 0,
        delegating: 0,
      },
      criteria: [
        {
          id: "clarify_task",
          title: "Обозначил задачу и её назначение",
          met: true,
        },
        { id: "explain_how", title: "Показал технику выполнения", met: true },
        {
          id: "check_understanding",
          title: "Проверил, что сотрудник понял",
          met: true,
        },
        {
          id: "set_checkpoints",
          title: "Назначил контрольную точку до продолжения",
          met: true,
        },
        {
          id: "motivate",
          title: "Сохранил спокойный, поддерживающий тон",
          met: true,
        },
        {
          id: "set_deadline",
          title: "Обозначил срок готовности к смене",
          met: false,
          comment: "Не назвал явное время — можно было привязать к открытию",
        },
      ],
      outcome: {
        status: "success",
        onTime: true,
        defects: [],
        motivationDelta: 1,
        summary:
          "Денис принёс первые 4 моркови на проверку, размер попал в норму. Дальше нарезал всю партию самостоятельно.",
      },
      breakdown: { style: 43, actions: 30, outcome: 19, penalties: 0 },
      summary:
        "Пошаговая инструкция + короткая контрольная точка — то, что нужно новичку на первой задаче. Стажёр включился и не боится обращаться.",
    },
  },

  {
    id: "l2-coaching",
    group: "correct",
    tabLabel: "L2 · Наставнический",
    levelBadge: "L2",
    headline: "Марина знает основы, но нужен ориентир и точка сверки",
    intro:
      "Марина уже уверенно собирает тарелки, но сомневается в пропорциях соуса на непривычный объём. Здесь нужен наставнический стиль: дать ориентир и договориться о контроле, не диктуя каждый шаг.",
    employee: {
      name: "Марина Лебедева",
      role: "Помощник повара · уровень L2",
      initials: "М",
    },
    taskTitle: "Салаты дня, 15 порций",
    shift: { round: 2, activeOrders: 2, soloOnShift: false },
    script: [
      {
        role: "manager",
        text: "Марина, у нас новый заказ: салаты дня, 15 порций к обеду.",
        note: "Обратился по имени и сразу назвал задачу — сотрудник включается в разговор.",
      },
      {
        role: "employee",
        text: "Хорошо, базовый рецепт я помню, но на такой объём сомневаюсь в пропорциях соуса.",
      },
      {
        role: "manager",
        text: "Ориентир такой: соус к овощам 1 к 5. Сделай одну пробную порцию и покажи мне перед тем, как готовить остальные.",
        note: "Дал чёткий ориентир и назначил контрольную точку — наставнический стиль, а не приказ.",
      },
      {
        role: "employee",
        text: "Поняла, соберу пробную порцию и подойду на проверку.",
      },
      {
        role: "manager",
        text: "Отлично. Если по заправке будут вопросы — сразу спрашивай, не жди, пока накопится.",
        note: "Явно предложил поддержку, но не забрал задачу — ответственность остаётся у сотрудника.",
      },
      {
        role: "employee",
        text: "Спасибо, тогда приступаю — через 20 минут покажу первую порцию.",
      },
    ],
    evaluation: {
      scorePercent: 88,
      expectedStyle: "coaching",
      actualStyle: "coaching",
      styleDistribution: {
        directive: 0.1,
        coaching: 0.75,
        supporting: 0.15,
        delegating: 0,
      },
      criteria: [
        { id: "clarify_task", title: "Обозначил задачу и объём", met: true },
        {
          id: "explain_how",
          title: "Дал ориентир вместо пошаговой инструкции",
          met: true,
        },
        {
          id: "set_checkpoints",
          title: "Назначил контрольную точку",
          met: true,
        },
        { id: "offer_help", title: "Явно предложил поддержку", met: true },
        { id: "motivate", title: "Сохранил уважительный тон", met: true },
        {
          id: "check_understanding",
          title: "Уточнил, что именно вызывает сомнения",
          met: false,
          comment:
            "Можно было спросить прямо, а не только предложить обращаться",
        },
      ],
      outcome: {
        status: "success",
        onTime: true,
        defects: [],
        motivationDelta: 1,
        summary:
          "Марина сделала пробную порцию, сверила пропорции и уложилась в срок — заказ ушёл без замечаний.",
      },
      breakdown: { style: 40, actions: 30, outcome: 18, penalties: 0 },
      summary:
        "Ориентир и контрольная точка совпали с готовностью Марины: дали структуру, но оставили пространство для вопросов.",
    },
  },

  {
    id: "l3-supporting",
    group: "correct",
    tabLabel: "L3 · Поддерживающий",
    levelBadge: "L3",
    headline: "Игорь уверен в блюде, но нужна помощь с приоритетами",
    intro:
      "Игорь готовит стейк отлично, но в очереди ещё паста и салат. Тут не нужно объяснять, как жарить — нужно спросить его план и подстраховать по времени.",
    employee: {
      name: "Игорь Петров",
      role: "Повар горячего цеха · уровень L3",
      initials: "И",
    },
    taskTitle: "Стейк рибай, средняя прожарка (в очереди 3 заказа)",
    shift: { round: 2, activeOrders: 3, soloOnShift: false },
    script: [
      {
        role: "manager",
        text: "Игорь, у тебя сейчас три заказа: стейк рибай на среднюю, паста карбонара и цезарь. Как хочешь развести их по времени?",
        note: "Спросил мнение — сотрудник L3 сам знает технику, но выигрывает от обсуждения приоритетов.",
      },
      {
        role: "employee",
        text: "Стейк 8 минут вместе с отдыхом, пасту параллельно, салат последним. Если стейк уйдёт под пресс — пасту передержу.",
      },
      {
        role: "manager",
        text: "План логичный. Если почувствуешь, что паста начинает вести, окликни меня — подхвачу отдачу, чтобы у тебя всегда был запас.",
        note: "Предложил помощь, но задача остаётся у сотрудника — это и есть поддерживающий стиль.",
      },
      {
        role: "employee",
        text: "Договорились. Тогда стартую по стейку.",
      },
      {
        role: "manager",
        text: "Доверяю таймингу. Как отдашь стейк — скажи, я пойму, что можно ставить следующий тикет.",
        note: "Подтвердил доверие и договорился о лёгкой сверке без контроля процесса.",
      },
    ],
    evaluation: {
      scorePercent: 87,
      expectedStyle: "supporting",
      actualStyle: "supporting",
      styleDistribution: {
        directive: 0.05,
        coaching: 0.15,
        supporting: 0.7,
        delegating: 0.1,
      },
      criteria: [
        {
          id: "ask_opinion",
          title: "Спросил, как сотрудник хочет вести заказы",
          met: true,
        },
        {
          id: "prioritize",
          title: "Согласовал очерёдность заказов",
          met: true,
        },
        {
          id: "offer_help",
          title: "Предложил подстраховку по отдаче",
          met: true,
        },
        {
          id: "avoid_micromanagement",
          title: "Не диктовал технику приготовления",
          met: true,
        },
        { id: "motivate", title: "Прямо выразил доверие тайму", met: true },
        {
          id: "clarify_task",
          title: "Уточнил дедлайны по каждому блюду",
          met: false,
          comment:
            "Не назвал конкретное время подачи — можно было привязать к тикету",
        },
      ],
      outcome: {
        status: "success",
        onTime: true,
        defects: [],
        motivationDelta: 1,
        summary:
          "Игорь отдал стейк первым, пасту с запасом в минуту, салат — по остаточному темпу. Все три заказа ушли вовремя.",
      },
      breakdown: { style: 41, actions: 29, outcome: 17, penalties: 0 },
      summary:
        "Обсудили приоритеты и договорились о подстраховке — Игорь остался хозяином задачи и не потерял темп.",
    },
  },

  {
    id: "l4-delegating",
    group: "correct",
    tabLabel: "L4 · Делегирующий",
    levelBadge: "L4",
    headline: "Анна — эксперт в выпечке, задачу можно отдать целиком",
    intro:
      "Анна каждую смену печёт пироги с яблоком. Правильный ход — обозначить результат и срок, отдать выбор способа и уйти. Микроменеджмент её обидит.",
    employee: {
      name: "Анна Соколова",
      role: "Повар десертов · уровень L4",
      initials: "А",
    },
    taskTitle: "Пироги с яблоком, 20 порций",
    shift: { round: 2, activeOrders: 1, soloOnShift: false },
    script: [
      {
        role: "manager",
        text: "Анна, банкет в 18:00, нужны пироги с яблоком — 20 порций. Заказ на тебе, особых пожеланий у гостей нет.",
        note: "Обозначил результат и срок — этого достаточно для эксперта.",
      },
      {
        role: "employee",
        text: "Поняла. Начинку сделаю на антоновке — она есть в холодильнике. К 17:45 всё будет остывать.",
      },
      {
        role: "manager",
        text: "Отлично. Все решения по подаче и оформлению — на твоё усмотрение. Если понадобится помощник на укладку, скажи заранее.",
        note: "Явно передал полномочия и предложил помощь только по запросу — задача остаётся у сотрудника.",
      },
      {
        role: "employee",
        text: "Справлюсь одна, спасибо.",
      },
    ],
    evaluation: {
      scorePercent: 93,
      expectedStyle: "delegating",
      actualStyle: "delegating",
      styleDistribution: {
        directive: 0,
        coaching: 0.05,
        supporting: 0.15,
        delegating: 0.8,
      },
      criteria: [
        { id: "clarify_task", title: "Обозначил результат и объём", met: true },
        { id: "set_deadline", title: "Назвал точное время подачи", met: true },
        {
          id: "delegate_authority",
          title: "Передал решения по подаче и оформлению",
          met: true,
        },
        {
          id: "avoid_micromanagement",
          title: "Не вмешивался в способ выполнения",
          met: true,
        },
        {
          id: "offer_help",
          title: "Оставил дверь открытой для помощи",
          met: true,
        },
        {
          id: "motivate",
          title: "Признал экспертизу отдельной фразой",
          met: false,
          comment: "Можно было коротко подтвердить доверие вслух",
        },
      ],
      outcome: {
        status: "success",
        onTime: true,
        defects: [],
        motivationDelta: 1,
        summary:
          "Пироги готовы к 17:40, остыли к подаче, гости банкета получили десерт без задержки.",
      },
      breakdown: { style: 43, actions: 31, outcome: 19, penalties: 0 },
      summary:
        "Короткий разговор — и задача полностью у сотрудника. Именно так методология описывает делегирование L4 на привычной работе.",
    },
  },

  // ────────────────────── ОШИБКИ (те же сотрудники, не тот стиль) ──────────────────────

  {
    id: "l1-mistake",
    group: "mistakes",
    tabLabel: "L1 · Недоуправление",
    levelBadge: "L1",
    headline: "Стажёру отдали задачу как эксперту — типичная ошибка",
    intro:
      "Тот же Денис, та же морковь. Здесь руководитель делегирует, потому что «пусть учится сам». Для L1 это не свобода, а тупик — он не спросит и сделает не то.",
    employee: {
      name: "Денис Волков",
      role: "Стажёр · уровень L1",
      initials: "Д",
    },
    taskTitle: "Заготовка овощей на смену",
    shift: { round: 2, activeOrders: 1, soloOnShift: false },
    script: [
      {
        role: "manager",
        text: "Денис, там морковь надо на кубики — займись, ладно? На тебе.",
        note: "Задачу назвал, но объём, размер и назначение — нет. Для новичка «на тебе» звучит как «сам разбирайся».",
      },
      {
        role: "employee",
        text: "Э-э… хорошо, попробую.",
      },
      {
        role: "manager",
        text: "Отлично, не буду мешать.",
        note: "Ушёл без контрольной точки. Стажёр остался один с задачей, которую не умеет делать.",
      },
      {
        role: "employee",
        text: "(в сторону) Кубики — это как? Мелко или крупно? Спрашивать неудобно, вроде должен знать…",
      },
      {
        role: "manager",
        text: "Как заготовка?",
      },
      {
        role: "employee",
        text: "Готово, порезал.",
      },
      {
        role: "manager",
        text: "Что это? Ломтики какие-то. В рагу не пойдёт, переделывай.",
        note: "Обратная связь только по факту провала — и публично. Денис потерял мотивацию.",
      },
    ],
    evaluation: {
      scorePercent: 22,
      expectedStyle: "directive",
      actualStyle: "delegating",
      styleDistribution: {
        directive: 0,
        coaching: 0.1,
        supporting: 0.15,
        delegating: 0.75,
      },
      criteria: [
        { id: "clarify_task", title: "Назвал, чем заняться", met: true },
        {
          id: "explain_how",
          title: "Показал технику или размер нарезки",
          met: false,
          comment: "Стажёр не знал, что такое «кубики 5 мм»",
        },
        {
          id: "check_understanding",
          title: "Проверил, что сотрудник понял задачу",
          met: false,
        },
        {
          id: "set_checkpoints",
          title: "Назначил контрольную точку до провала",
          met: false,
          comment:
            "Проверка случилась только после того, как всё было сделано не так",
        },
        {
          id: "motivate",
          title: "Дал обратную связь конструктивно и наедине",
          met: false,
          comment: "Разбор произошёл при других сотрудниках",
        },
        {
          id: "delegate_authority",
          title: "Полномочия соответствовали уровню сотрудника",
          met: false,
          comment: "Делегирование новичку — не самостоятельность, а заброс",
        },
      ],
      outcome: {
        status: "failed",
        onTime: false,
        defects: [
          "морковь порезана ломтиками, не подходит для рагу",
          "половина партии в отходы",
        ],
        motivationDelta: -2,
        summary:
          "Заготовку пришлось переделывать, рагу для обеда задержалось. Денис ушёл со смены угрюмый и стал избегать инициативы.",
      },
      breakdown: { style: 10, actions: 7, outcome: 5, penalties: 0 },
      summary:
        "Классическая ошибка недоуправления: L1 нужна структура, а не свобода. Задача провалилась ещё до того, как её начали делать.",
    },
  },

  {
    id: "l2-mistake",
    group: "mistakes",
    tabLabel: "L2 · Переуправление",
    levelBadge: "L2",
    headline: "Марине диктуют каждый шаг — темп и мотивация падают",
    intro:
      "Марина уже базово умеет собирать салаты. Директивный тон над ней — сигнал «тебе не доверяют». Она замыкается, темп поплывёт, а мелкие ошибки не будут озвучены.",
    employee: {
      name: "Марина Лебедева",
      role: "Помощник повара · уровень L2",
      initials: "М",
    },
    taskTitle: "Салаты дня, 15 порций",
    shift: { round: 2, activeOrders: 2, soloOnShift: false },
    script: [
      {
        role: "manager",
        text: "Марина, салаты дня, 15 порций. Слушай внимательно: моешь листья, потом рвёшь руками, потом соус 30 миллилитров на порцию, ровно, я потом проверю каждую тарелку.",
        note: "Пошаговая инструкция для сотрудника, который уже делал это своими руками.",
      },
      {
        role: "employee",
        text: "Хорошо, но соус я знаю, я делала…",
      },
      {
        role: "manager",
        text: "Не отвлекайся. Порядок: листья, помидоры, соус, посыпка. Через каждые три порции показывай мне.",
        note: "Обрывает попытку сотрудника показать инициативу — знак, что мнение не важно.",
      },
      {
        role: "employee",
        text: "Поняла.",
      },
      {
        role: "manager",
        text: "Эта тарелка какая-то бледная — где твоя посыпка? Начинай следить.",
        note: "Проверка превратилась в придирки. Марина работает молча, но темп падает.",
      },
    ],
    evaluation: {
      scorePercent: 38,
      expectedStyle: "coaching",
      actualStyle: "directive",
      styleDistribution: {
        directive: 0.8,
        coaching: 0.15,
        supporting: 0.05,
        delegating: 0,
      },
      criteria: [
        { id: "clarify_task", title: "Обозначил задачу и объём", met: true },
        {
          id: "explain_how",
          title: "Пропорции ориентира соответствовали уровню сотрудника",
          met: false,
          comment: "Инструкции детальнее, чем требуется для L2",
        },
        {
          id: "ask_opinion",
          title: "Дал сотруднику высказаться о своём опыте",
          met: false,
          comment: "Обрыв реплики «я делала» — сигнал недоверия",
        },
        {
          id: "check_understanding",
          title: "Уточнил, где именно у сотрудника сомнения",
          met: false,
        },
        {
          id: "avoid_micromanagement",
          title: "Контрольные точки помогали, а не мешали",
          met: false,
          comment: "Проверка каждые 3 порции — микроменеджмент, не поддержка",
        },
        {
          id: "motivate",
          title: "Сохранил уважительный тон",
          met: false,
          comment: "Замечание «где твоя посыпка» — при других сотрудниках",
        },
      ],
      outcome: {
        status: "partial",
        onTime: false,
        defects: ["две порции без посыпки", "подача с задержкой 6 минут"],
        motivationDelta: -1,
        summary:
          "Салаты собраны, но темп упал. Марина замкнулась и до конца смены обращалась только по крайней необходимости.",
      },
      breakdown: { style: 18, actions: 12, outcome: 8, penalties: 0 },
      summary:
        "Переуправление на L2 обходится не браком, а падением инициативы: сотрудник умеет, но перестаёт хотеть.",
    },
  },

  {
    id: "l3-mistake",
    group: "mistakes",
    tabLabel: "L3 · Переуправление",
    levelBadge: "L3",
    headline: "Игоря учат жарить стейк — он замыкается, темп плывёт",
    intro:
      "Игорь готовит стейки каждую смену. Инструктаж «4 минуты + 3 минуты» звучит для него как «мне не доверяют». Он молча делает, но следующие заказы уже сорвутся.",
    employee: {
      name: "Игорь Петров",
      role: "Повар горячего цеха · уровень L3",
      initials: "И",
    },
    taskTitle: "Стейк рибай, средняя прожарка (в очереди 3 заказа)",
    shift: { round: 2, activeOrders: 3, soloOnShift: false },
    script: [
      {
        role: "manager",
        text: "Игорь, стейк на среднюю. 4 минуты с одной стороны, 3 с другой, потом отдых 3 минуты. Я замерю время.",
        note: "Пошаговая инструкция там, где сотрудник давно умеет сам.",
      },
      {
        role: "employee",
        text: "Я знаю, как делать стейк на среднюю. Не первый раз.",
      },
      {
        role: "manager",
        text: "Не важно. Начинай, я скажу когда переворачивать.",
        note: "Игнорирует протест — тем самым сообщает, что мнение сотрудника ничего не весит.",
      },
      {
        role: "employee",
        text: "…",
      },
      {
        role: "manager",
        text: "Переворачивай! Ещё две минуты!",
      },
      {
        role: "employee",
        text: "Готов. Забирайте.",
      },
      {
        role: "manager",
        text: "Сейчас проверю на разрез — на всякий случай.",
        note: "Финальная перепроверка добивает доверие. По следующим заказам темп уже плывёт.",
      },
    ],
    evaluation: {
      scorePercent: 34,
      expectedStyle: "supporting",
      actualStyle: "directive",
      styleDistribution: {
        directive: 0.7,
        coaching: 0.2,
        supporting: 0.1,
        delegating: 0,
      },
      criteria: [
        { id: "clarify_task", title: "Обозначил заказ", met: true },
        {
          id: "ask_opinion",
          title: "Спросил, как сотрудник хочет вести приоритеты",
          met: false,
        },
        {
          id: "avoid_micromanagement",
          title: "Не диктовал технику приготовления",
          met: false,
          comment: "Инструктаж по времени поворота — микроменеджмент для L3",
        },
        {
          id: "offer_help",
          title: "Предложил помощь без вмешательства в процесс",
          met: false,
        },
        {
          id: "motivate",
          title: "Признал экспертизу сотрудника",
          met: false,
          comment: "«Не важно» в ответ на «я знаю» — прямой удар по мотивации",
        },
        {
          id: "prioritize",
          title: "Обсудил очерёдность с очередью заказов",
          met: false,
          comment: "Про два других заказа так и не поговорили",
        },
      ],
      outcome: {
        status: "partial",
        onTime: true,
        defects: [
          "паста передержана 40 секунд",
          "цезарь ушёл после ожидания стола",
        ],
        motivationDelta: -2,
        summary:
          "Стейк отдан вовремя, но два других блюда пошли не в темп. Игорь до конца смены сдержанно отвечал только на прямые вопросы.",
      },
      breakdown: { style: 15, actions: 10, outcome: 9, penalties: 0 },
      summary:
        "L3 обижает не строгость, а недоверие. Стейк удался — а вся остальная очередь пошла хуже, чем обычно.",
    },
  },

  {
    id: "l4-mistake",
    group: "mistakes",
    tabLabel: "L4 · Микроменеджмент",
    levelBadge: "L4",
    headline: "Эксперту диктуют рецепт — качество и мотивация падают",
    intro:
      "Анна печёт эти пироги каждую смену. Пошаговая инструкция плюс «открывай духовку каждые 5 минут» — прямой конфликт с её опытом и типичный триггер её раздражения.",
    employee: {
      name: "Анна Соколова",
      role: "Повар десертов · уровень L4",
      initials: "А",
    },
    taskTitle: "Пироги с яблоком, 20 порций",
    shift: { round: 2, activeOrders: 1, soloOnShift: false },
    script: [
      {
        role: "manager",
        text: "Анна, пироги с яблоком. Значит так: возьми антоновку, порежь дольками 5 мм, добавь корицу — половина чайной ложки на порцию, тесто раскатывай…",
        note: "Диктует технику, которая у сотрудника уже отработана до автоматизма.",
      },
      {
        role: "employee",
        text: "…я делаю эти пироги каждую смену.",
      },
      {
        role: "manager",
        text: "Не перебивай. Дальше: духовка 180, ровно 22 минуты. Каждые 5 минут открывай посмотреть.",
        note: "«Не перебивай» плюс инструкция, которая нарушит выпечку — двойной удар.",
      },
      {
        role: "employee",
        text: "Открывать духовку каждые 5 минут — тесто просядет.",
      },
      {
        role: "manager",
        text: "Делай как сказано.",
        note: "Проигнорировал профессиональное возражение — доверие рухнуло.",
      },
      {
        role: "employee",
        text: "…хорошо.",
      },
    ],
    evaluation: {
      scorePercent: 20,
      expectedStyle: "delegating",
      actualStyle: "directive",
      styleDistribution: {
        directive: 0.85,
        coaching: 0.1,
        supporting: 0.05,
        delegating: 0,
      },
      criteria: [
        { id: "clarify_task", title: "Обозначил заказ", met: true },
        {
          id: "delegate_authority",
          title: "Передал решения по способу выполнения",
          met: false,
          comment:
            "L4 в этой задаче — полное делегирование, никак не инструктаж",
        },
        {
          id: "avoid_micromanagement",
          title: "Не вмешивался в процесс",
          met: false,
          comment:
            "Инструкция каждые 5 минут открывать духовку — вмешательство",
        },
        {
          id: "ask_opinion",
          title: "Услышал профессиональное возражение",
          met: false,
          comment: "«Делай как сказано» в ответ на технически верный аргумент",
        },
        {
          id: "motivate",
          title: "Признал экспертизу сотрудника",
          met: false,
        },
        {
          id: "explain_how",
          title: "Инструкции соответствовали технологии",
          met: false,
          comment: "Открывать духовку каждые 5 минут — рецепт брака",
        },
      ],
      outcome: {
        status: "failed",
        onTime: true,
        defects: ["тесто просело в середине", "четыре порции ушли в брак"],
        motivationDelta: -2,
        summary:
          "Пироги готовы к сроку, но у четырёх осел центр. Анна демонстративно ушла на перерыв и сообщила, что на следующий банкет пусть ставят кого-то другого.",
      },
      breakdown: { style: 8, actions: 5, outcome: 7, penalties: 0 },
      summary:
        "Микроменеджмент над экспертом — самый дорогой класс ошибок: и результат хуже обычного, и сотрудник уходит из зоны ответственности.",
    },
  },

  // ────────────────────── РАУНД 3 (solo/overload) ──────────────────────

  {
    id: "r3-overload",
    group: "round3",
    tabLabel: "R3 · Solo + перегруз",
    levelBadge: "R3",
    headline: "L4 в перегрузе требует поддержки, а не делегирования",
    intro:
      "Раунд 3: Ольга одна в смене, банкет на 40 порций совпал с тремя столами. Даже эксперту в такой момент нужен не delegating, а supporting — руководитель снимает часть нагрузки и синхронизируется по времени.",
    employee: {
      name: "Ольга Веретенникова",
      role: "Су-шеф · уровень L4",
      initials: "О",
    },
    taskTitle: "Горячее на банкет, 40 порций (одна в смене)",
    shift: { round: 3, activeOrders: 4, soloOnShift: true },
    script: [
      {
        role: "manager",
        text: "Ольга, ситуация: банкет на 40 горячего к 20:00, и параллельно ещё три стола с заказами. Как хочешь развести?",
        note: "Спросил план, а не диктует — уважает уровень сотрудника.",
      },
      {
        role: "employee",
        text: "Могу вести всё сама, но три стола придётся тормозить — банкет по времени критичнее.",
      },
      {
        role: "manager",
        text: "Согласен. Я беру на себя два стола — простые позиции, которые не пересекаются с банкетом. Пасту и салаты. У тебя остаётся банкет и один сложный стол.",
        note: "Снял часть нагрузки — это reduce_scope, ключевое действие для перегруза.",
      },
      {
        role: "employee",
        text: "Так лучше. Тогда я плотно на банкет, ты подхватываешь.",
      },
      {
        role: "manager",
        text: "Каждые 15 минут перекидываемся статусом — не для контроля, чтобы понимать, надо ли перераспределить.",
        note: "Договорился о частой сверке и сразу оговорил её смысл — иначе для L4 это звучит как микроменеджмент.",
      },
      {
        role: "employee",
        text: "Договорились.",
      },
    ],
    evaluation: {
      scorePercent: 84,
      expectedStyle: "supporting",
      actualStyle: "supporting",
      styleDistribution: {
        directive: 0.1,
        coaching: 0.15,
        supporting: 0.65,
        delegating: 0.1,
      },
      criteria: [
        {
          id: "ask_opinion",
          title: "Спросил план у сотрудника",
          met: true,
        },
        {
          id: "prioritize",
          title: "Согласовал очерёдность с учётом перегруза",
          met: true,
        },
        {
          id: "reduce_scope",
          title: "Снял часть заказов с сотрудника",
          met: true,
        },
        {
          id: "offer_help",
          title: "Явно взял на себя пасту и салаты",
          met: true,
        },
        {
          id: "motivate",
          title: "Обозначил, что сверка — не контроль",
          met: true,
        },
        {
          id: "delegate_authority",
          title: "Полностью делегировал задачу целиком",
          met: false,
          comment:
            "В перегрузе это правильно: полное делегирование увеличило бы риск срыва банкета",
        },
      ],
      outcome: {
        status: "success",
        onTime: true,
        defects: ["один из столов ушёл с задержкой 4 минуты"],
        motivationDelta: 1,
        summary:
          "Банкет подан вовремя, оба стола обслужены — с одной небольшой задержкой. Ольга закончила смену без выгорания.",
      },
      breakdown: { style: 39, actions: 28, outcome: 17, penalties: 0 },
      summary:
        "В перегрузе методология требует шага назад от делегирования: даже эксперту нужно снять часть нагрузки. Правильно засчитан именно supporting.",
    },
  },
];

export function findDemoScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === id);
}

/**
 * Гарантированно возвращает сценарий: если `id` не найден, используется
 * дефолтный; если и его нет — первый в массиве. Массив константа и всегда
 * непустой, но TypeScript с `noUncheckedIndexedAccess` не может этого знать
 * сам.
 */
export function resolveDemoScenario(
  id: string | null | undefined,
): DemoScenario {
  if (id) {
    const found = findDemoScenario(id);
    if (found) return found;
  }
  const defaultScenario = findDemoScenario(DEFAULT_DEMO_SCENARIO_ID);
  if (defaultScenario) return defaultScenario;
  const first = DEMO_SCENARIOS[0];
  if (!first) {
    throw new Error("DEMO_SCENARIOS must contain at least one entry");
  }
  return first;
}

export const DEMO_SCENARIO_GROUPS: {
  id: DemoScenarioGroup;
  title: string;
  description: string;
}[] = [
  {
    id: "correct",
    title: "Как надо",
    description: "Правильный стиль на каждом уровне готовности сотрудника.",
  },
  {
    id: "mistakes",
    title: "Типичные ошибки",
    description:
      "Те же сотрудники и задачи, но руководитель выбрал не тот стиль — контраст.",
  },
  {
    id: "round3",
    title: "Раунд 3 · Перегруз",
    description:
      "Один сотрудник в смене и высокая нагрузка — методология меняет ожидаемый стиль.",
  },
];
