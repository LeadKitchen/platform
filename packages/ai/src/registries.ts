import { createRegistry } from "./registry";
import { heuristicEngagement } from "./strategies/engagement/heuristic";
import { llmEngagement } from "./strategies/engagement/llm";
import { debateJudgeEvaluation } from "./strategies/evaluation/debate-judge";
import { hybridEvaluation } from "./strategies/evaluation/hybrid";
import { llmJudgeEvaluation } from "./strategies/evaluation/llm-judge";
import { rulesEvaluation } from "./strategies/evaluation/rules";
import { baselineKnowledge } from "./strategies/knowledge/baseline";
import { contextualKnowledge } from "./strategies/knowledge/contextual-rag";
import { correctiveRagKnowledge } from "./strategies/knowledge/crag";
import { graphRagKnowledge } from "./strategies/knowledge/graph-rag";
import { hybridRagKnowledge } from "./strategies/knowledge/hybrid-rag";
import { hydeKnowledge } from "./strategies/knowledge/hyde-rag";
import { orgFusionRagKnowledge } from "./strategies/knowledge/org-fusion-rag";
import { orgRagKnowledge } from "./strategies/knowledge/org-rag";
import { ragKnowledge } from "./strategies/knowledge/rag";
import { rerankRagKnowledge } from "./strategies/knowledge/rerank-rag";
import { promptPersona } from "./strategies/persona/prompt";
import { selfConsistencyPersona } from "./strategies/persona/self-consistency";
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
knowledgeRegistry.register(hydeKnowledge);
knowledgeRegistry.register(contextualKnowledge);
knowledgeRegistry.register(rerankRagKnowledge);
knowledgeRegistry.register(correctiveRagKnowledge);
knowledgeRegistry.register(orgRagKnowledge);
knowledgeRegistry.register(orgFusionRagKnowledge);

personaRegistry.register(promptPersona);
personaRegistry.register(skillRlPersona);
personaRegistry.register(selfConsistencyPersona);

evaluationRegistry.register(rulesEvaluation);
evaluationRegistry.register(llmJudgeEvaluation);
evaluationRegistry.register(hybridEvaluation);
evaluationRegistry.register(debateJudgeEvaluation);

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
