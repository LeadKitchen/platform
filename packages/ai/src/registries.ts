import { createRegistry } from "./registry";
import { heuristicEngagement } from "./strategies/engagement/heuristic";
import { llmEngagement } from "./strategies/engagement/llm";
import { hybridEvaluation } from "./strategies/evaluation/hybrid";
import { llmJudgeEvaluation } from "./strategies/evaluation/llm-judge";
import { rulesEvaluation } from "./strategies/evaluation/rules";
import { baselineKnowledge } from "./strategies/knowledge/baseline";
import { graphRagKnowledge } from "./strategies/knowledge/graph-rag";
import { hybridRagKnowledge } from "./strategies/knowledge/hybrid-rag";
import { ragKnowledge } from "./strategies/knowledge/rag";
import { promptPersona } from "./strategies/persona/prompt";
import { skillRlPersona } from "./strategies/persona/skill-rl";
import type {
  EngagementStrategy,
  EvaluationStrategy,
  KnowledgeStrategy,
  PersonaStrategy,
} from "./types";

export const engagementRegistry =
  createRegistry<EngagementStrategy>("engagement");
export const knowledgeRegistry = createRegistry<KnowledgeStrategy>("knowledge");
export const personaRegistry = createRegistry<PersonaStrategy>("persona");
export const evaluationRegistry =
  createRegistry<EvaluationStrategy>("evaluation");

engagementRegistry.register(heuristicEngagement);
engagementRegistry.register(llmEngagement);

knowledgeRegistry.register(baselineKnowledge);
knowledgeRegistry.register(ragKnowledge);
knowledgeRegistry.register(graphRagKnowledge);
knowledgeRegistry.register(hybridRagKnowledge);

personaRegistry.register(promptPersona);
personaRegistry.register(skillRlPersona);

evaluationRegistry.register(rulesEvaluation);
evaluationRegistry.register(llmJudgeEvaluation);
evaluationRegistry.register(hybridEvaluation);

/** Everything the admin UI needs to render the "approaches" picker. */
export function describeStrategies() {
  return {
    engagement: engagementRegistry
      .list()
      .map(({ id, description }) => ({ id, description })),
    knowledge: knowledgeRegistry
      .list()
      .map(({ id, description }) => ({ id, description })),
    persona: personaRegistry
      .list()
      .map(({ id, description }) => ({ id, description })),
    evaluation: evaluationRegistry
      .list()
      .map(({ id, description }) => ({ id, description })),
  };
}
