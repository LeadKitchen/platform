import {
  type Catalog,
  COMPETENCE_LABELS,
  describePersonality,
  describeTask,
  LEVEL_LABELS,
  STYLE_LABELS,
} from "@acme/game";

/**
 * The knowledge base the retrieval strategies work over.
 *
 * It is built from the same catalog the rules engine uses plus the methodology
 * texts, and it is deliberately plain data: swapping the in-memory lexical
 * index for a real vector store or a graph database means replacing the
 * *strategy*, not this file.
 */
export interface KnowledgeDoc {
  id: string;
  text: string;
  source: "profile" | "competence" | "task" | "methodology" | "shift";
  /**
   * Who may see this document.
   *
   * `judge` covers the methodology itself — style names, readiness levels, the
   * matrix. Those must never reach the role-play prompt, or the character can
   * hand the participant the answer. Enforcing it here means a new retrieval
   * strategy cannot leak by accident.
   */
  audience: "character" | "judge" | "both";
  /** Entity ids this document is about — used by the graph strategy. */
  tags: string[];
}

const STYLE_PLAYBOOK: Record<string, string> = {
  directive:
    "Директивный стиль: руководитель говорит что и как делать, задаёт шаги, назначает точки контроля и проверяет понимание. Применяется, когда компетенция по задаче низкая или задача новая и сложная.",
  coaching:
    "Наставнический стиль: руководитель объясняет, показывает и одновременно поддерживает, оставляет контрольные точки и мотивирует. Применяется, когда сотрудник осваивает задачу.",
  supporting:
    "Поддерживающий стиль: руководитель спрашивает мнение, помогает решать, подставляет ресурс, но не диктует шаги. Применяется, когда сотрудник умеет, но не уверен или перегружен.",
  delegating:
    "Делегирующий стиль: руководитель передаёт ответственность за результат, обозначает срок и не вмешивается в процесс. Применяется, когда сотрудник эксперт в этой задаче.",
};

const METHODOLOGY: KnowledgeDoc[] = [
  ...Object.entries(STYLE_PLAYBOOK).map(([style, text]) => ({
    id: `methodology:style:${style}`,
    text: `${STYLE_LABELS[style as keyof typeof STYLE_LABELS]}. ${text}`,
    source: "methodology" as const,
    audience: "judge" as const,
    tags: ["style", style],
  })),
  ...Object.entries(LEVEL_LABELS).map(([level, label]) => ({
    id: `methodology:level:${level}`,
    text: `Уровень готовности ${label}.`,
    source: "methodology" as const,
    audience: "judge" as const,
    tags: ["level", level],
  })),
  {
    id: "methodology:matrix",
    text: "Стиль управления определяется не только уровнем сотрудника, но и новизной задачи: на новой или сложной задаче даже сильный сотрудник требует более директивного стиля и точек контроля.",
    source: "methodology",
    audience: "judge",
    tags: ["style", "matrix", "novelty"],
  },
  {
    id: "methodology:overload_rule",
    text: "При перегрузе руководитель обязан расставить приоритеты, предложить помощь или снять часть нагрузки. Избыточная директивность при перегрузе ломает мотивацию, избыточное делегирование ведёт к хаосу.",
    source: "methodology",
    audience: "judge",
    tags: ["overload", "round3", "priority"],
  },
  {
    id: "kitchen:checkpoints",
    text: "Промежуточный показ — момент, когда повар показывает результат до подачи: перед сборкой, перед отдачей, за несколько минут до дедлайна. Для новых и срочных заказов это обязательная часть регламента кухни.",
    source: "methodology",
    audience: "both",
    tags: ["checkpoints", "control"],
  },
  {
    id: "kitchen:overload",
    text: "Когда заказов больше, чем реально успеть, нормально сказать об этом и попросить порядок выполнения, помощь или упрощение позиции.",
    source: "methodology",
    audience: "both",
    tags: ["overload", "round3", "priority"],
  },
  {
    id: "kitchen:solo_shift",
    text: "Если в смене остался один повар, очередь заказов растёт, а вместе с ней усталость и риск ошибок: важно понимать, что делать первым.",
    source: "methodology",
    audience: "both",
    tags: ["round3", "solo", "overload"],
  },
];

export function buildCorpus(catalog: Catalog): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [...METHODOLOGY];

  for (const employee of catalog.employees) {
    docs.push({
      id: `profile:${employee.id}`,
      text: [
        `${employee.name} — ${employee.role}.`,
        ...describePersonality(employee),
      ].join(" "),
      source: "profile",
      audience: "both",
      tags: [employee.id, employee.level],
    });

    docs.push({
      id: `level:${employee.id}`,
      text: `${employee.name} — уровень готовности ${employee.level}: ${LEVEL_LABELS[employee.level]}.`,
      source: "profile",
      audience: "judge",
      tags: [employee.id, employee.level, "level"],
    });

    for (const [taskType, competence] of Object.entries(employee.competences)) {
      docs.push({
        id: `competence:${employee.id}:${taskType}`,
        text: `${employee.name}, тип задач «${taskType}»: ${COMPETENCE_LABELS[competence]}.`,
        source: "competence",
        audience: "both",
        tags: [employee.id, taskType, competence],
      });
    }
  }

  for (const task of catalog.tasks) {
    docs.push({
      id: `task:${task.id}`,
      text: describeTask(task),
      source: "task",
      audience: "both",
      tags: [task.id, task.type],
    });
  }

  return docs;
}

const STOP_WORDS = new Set([
  "и",
  "в",
  "на",
  "с",
  "по",
  "не",
  "что",
  "как",
  "к",
  "за",
  "у",
  "из",
  "для",
  "то",
  "а",
  "но",
  "же",
  "ты",
  "я",
  "мы",
  "он",
  "она",
]);

/** Crude Russian stemming: enough to match «пирог/пироги/пирогов». */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map((token) => token.slice(0, 6));
}

export interface ScoredDoc {
  doc: KnowledgeDoc;
  score: number;
}

/**
 * Lexical (TF-IDF) search. Deterministic and dependency-free on purpose — it
 * is the honest baseline a real embedding index has to beat in the harness.
 */
export function searchCorpus(
  corpus: KnowledgeDoc[],
  query: string,
  topK: number,
  audience: KnowledgeDoc["audience"] = "character",
): ScoredDoc[] {
  const visible =
    audience === "judge"
      ? corpus
      : corpus.filter((doc) => doc.audience !== "judge");
  return searchVisible(visible, query, topK);
}

function searchVisible(
  corpus: KnowledgeDoc[],
  query: string,
  topK: number,
): ScoredDoc[] {
  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0) return [];

  const documentFrequency = new Map<string, number>();
  const tokenized = corpus.map((doc) => {
    const tokens = tokenize(doc.text);
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    return { doc, tokens };
  });

  const scored = tokenized.map(({ doc, tokens }) => {
    let score = 0;
    for (const term of queryTerms) {
      const termFrequency = tokens.filter((token) => token === term).length;
      if (termFrequency === 0) continue;
      const idf = Math.log(
        1 + corpus.length / (1 + (documentFrequency.get(term) ?? 0)),
      );
      score += idf * (termFrequency / (termFrequency + 1));
    }
    return { doc, score: score / Math.sqrt(Math.max(1, tokens.length / 10)) };
  });

  const best = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const max = best[0]?.score ?? 1;
  return best.map((item) => ({ doc: item.doc, score: item.score / max }));
}
