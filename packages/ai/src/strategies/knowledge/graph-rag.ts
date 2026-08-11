import type { Catalog } from "@acme/game";

import {
  buildGraph,
  inferenceFacts,
  type KnowledgeGraph,
  traverse,
} from "../../knowledge/graph";
import type { KnowledgeStrategy } from "../../types";

const cache = new WeakMap<Catalog, KnowledgeGraph>();

function graphFor(catalog: Catalog): KnowledgeGraph {
  const cached = cache.get(catalog);
  if (cached) return cached;
  const graph = buildGraph(catalog);
  cache.set(catalog, graph);
  return graph;
}

/**
 * Graph arm: instead of matching words, walk the relations.
 *
 * The interesting facts in this domain are *derived* — "senior employee, but a
 * novice at this task type, and the task is complex" is three hops, not one
 * keyword. This strategy surfaces those paths, and the harness measures
 * whether they actually make the character (and the score) better.
 */
export const graphRagKnowledge: KnowledgeStrategy = {
  id: "graph-rag",
  description:
    "Обход графа знаний (сотрудник → уровень → компетенция → тип задачи → правила) с выводом производных фактов.",

  async retrieve(request, deps) {
    const startedAt = Date.now();
    const hops = typeof deps.params.hops === "number" ? deps.params.hops : 2;
    const graph = graphFor(deps.catalog);

    const { employee, task, shift } = request.dialog;
    const seeds = [`employee:${employee.id}`, `task:${task.id}`];
    const walk = traverse(graph, seeds, hops);

    const snippets = walk.facts.map((fact) => ({
      id: `graph:${fact.id}`,
      text: fact.text,
      score: 1 / fact.hops,
      source: "graph",
    }));

    for (const [index, fact] of inferenceFacts(
      deps.catalog,
      employee.id,
      task.id,
      shift,
    ).entries()) {
      snippets.unshift({
        id: `inference:${index}`,
        text: fact,
        score: 1,
        source: "graph",
      });
    }

    return {
      snippets,
      latencyMs: Date.now() - startedAt,
      meta: { hops, visited: walk.visited.length },
    };
  },
};
