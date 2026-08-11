import {
  type Catalog,
  COMPETENCE_LABELS,
  LEVEL_LABELS,
  resolveExpectation,
  STYLE_LABELS,
} from "@acme/game";

/**
 * A small property graph over the reference data.
 *
 * The GraphRAG strategy walks it instead of matching keywords, which is what
 * lets it surface *derived* facts — "Анна → уровень L4 → но по типу задач
 * `decorating` она новичок → правило матрицы → ожидается директивный стиль" —
 * that a lexical index cannot connect on its own.
 */

export type NodeType =
  | "employee"
  | "level"
  | "task"
  | "task_type"
  | "competence"
  | "style"
  | "rule";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  label: string;
}

export interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

function node(graph: KnowledgeGraph, item: GraphNode): string {
  if (!graph.nodes.has(item.id)) graph.nodes.set(item.id, item);
  return item.id;
}

export function buildGraph(catalog: Catalog): KnowledgeGraph {
  const graph: KnowledgeGraph = { nodes: new Map(), edges: [] };

  for (const [style, label] of Object.entries(STYLE_LABELS)) {
    node(graph, { id: `style:${style}`, type: "style", label });
  }
  for (const [level, label] of Object.entries(LEVEL_LABELS)) {
    node(graph, { id: `level:${level}`, type: "level", label });
  }

  for (const task of catalog.tasks) {
    const taskId = node(graph, {
      id: `task:${task.id}`,
      type: "task",
      label: task.title,
    });
    const typeId = node(graph, {
      id: `task_type:${task.type}`,
      type: "task_type",
      label: task.type,
    });
    graph.edges.push({
      from: taskId,
      to: typeId,
      type: "of_type",
      label: `«${task.title}» относится к типу задач ${task.type}`,
    });

    if (task.requiresCheckpoints) {
      const ruleId = node(graph, {
        id: "rule:checkpoints",
        type: "rule",
        label: "Обязательные точки контроля",
      });
      graph.edges.push({
        from: taskId,
        to: ruleId,
        type: "requires",
        label: `«${task.title}» требует точек контроля по правилам`,
      });
    }

    if (task.complexity >= 4) {
      const ruleId = node(graph, {
        id: "rule:complex_task",
        type: "rule",
        label: "Сложная задача усиливает контроль",
      });
      graph.edges.push({
        from: taskId,
        to: ruleId,
        type: "raises",
        label: `«${task.title}» сложная (${task.complexity}/5): нужен более структурный стиль`,
      });
    }
  }

  for (const employee of catalog.employees) {
    const employeeId = node(graph, {
      id: `employee:${employee.id}`,
      type: "employee",
      label: `${employee.name}, ${employee.role}`,
    });
    graph.edges.push({
      from: employeeId,
      to: `level:${employee.level}`,
      type: "has_level",
      label: `${employee.name} — уровень ${employee.level}`,
    });

    for (const [taskType, competence] of Object.entries(employee.competences)) {
      const typeId = node(graph, {
        id: `task_type:${taskType}`,
        type: "task_type",
        label: taskType,
      });
      const competenceId = node(graph, {
        id: `competence:${employee.id}:${taskType}`,
        type: "competence",
        label: `${employee.name} по типу «${taskType}»: ${COMPETENCE_LABELS[competence]}`,
      });
      graph.edges.push({
        from: employeeId,
        to: competenceId,
        type: "has_competence",
        label: `${employee.name} по типу «${taskType}»: ${COMPETENCE_LABELS[competence]}`,
      });
      graph.edges.push({
        from: competenceId,
        to: typeId,
        type: "about",
        label: `Компетенция относится к типу задач ${taskType}`,
      });
    }
  }

  node(graph, {
    id: "rule:matrix",
    type: "rule",
    label:
      "Стиль = уровень сотрудника + компетенция по конкретной задаче + контекст смены",
  });
  node(graph, {
    id: "rule:overload",
    type: "rule",
    label:
      "При перегрузе: приоритизация, помощь, снижение объёма; крайняя директивность демотивирует",
  });

  return graph;
}

export interface TraversalResult {
  /** Human-readable facts along the walked paths. */
  facts: { id: string; text: string; hops: number }[];
  visited: string[];
}

/** Breadth-first walk from the dialog's entities. */
export function traverse(
  graph: KnowledgeGraph,
  seeds: string[],
  maxHops: number,
): TraversalResult {
  const visited = new Set<string>();
  const facts: TraversalResult["facts"] = [];
  let frontier = seeds.filter((seed) => graph.nodes.has(seed));
  for (const seed of frontier) visited.add(seed);

  for (let hop = 1; hop <= maxHops; hop += 1) {
    const next: string[] = [];
    for (const edge of graph.edges) {
      const forward = frontier.includes(edge.from);
      const backward = frontier.includes(edge.to);
      if (!forward && !backward) continue;

      const other = forward ? edge.to : edge.from;
      facts.push({
        id: `${edge.from}->${edge.to}`,
        text: edge.label,
        hops: hop,
      });
      if (!visited.has(other)) {
        visited.add(other);
        next.push(other);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  const seen = new Set<string>();
  return {
    facts: facts.filter((fact) => {
      if (seen.has(fact.id)) return false;
      seen.add(fact.id);
      return true;
    }),
    visited: [...visited],
  };
}

/**
 * The derived conclusion the graph exists for: the rule path from the concrete
 * employee + task + shift to what this person actually needs right now.
 *
 * Note what is deliberately *absent* — the name of the expected management
 * style. The character may feel unsure and ask for instructions, but it must
 * never hand the participant the answer, so the leaked-answer risk is removed
 * at the data layer rather than left to prompt discipline.
 */
export function inferenceFacts(
  catalog: Catalog,
  employeeId: string,
  taskId: string,
  shift: Parameters<typeof resolveExpectation>[2],
): string[] {
  const employee = catalog.employees.find((item) => item.id === employeeId);
  const task = catalog.tasks.find((item) => item.id === taskId);
  if (!employee || !task) return [];

  const expectation = resolveExpectation(employee, task, shift);

  const needs = expectation.requiredCriteria
    .map((criterion) => criterion.title.toLowerCase())
    .join("; ");

  const facts = [
    `Путь вывода: ${employee.name} → уровень ${employee.level} → компетенция по типу «${task.type}» (${COMPETENCE_LABELS[expectation.competence]}) → правило матрицы.`,
    `Чтобы заказ получился, сотруднику в этой ситуации не хватает без руководителя: ${needs}.`,
  ];

  if (expectation.isNovelTask) {
    facts.push(
      `Задача «${task.title}» для сотрудника новая — внутренне он не уверен, даже если внешне держится спокойно.`,
    );
  }
  if (shift.load !== "normal") {
    facts.push(
      `Смена в состоянии «${shift.load}»: активных заказов ${shift.activeOrders}${shift.soloOnShift ? ", сотрудник один в смене" : ""}.`,
    );
  }

  return facts;
}
