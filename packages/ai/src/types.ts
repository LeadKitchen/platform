import type {
  Catalog,
  DialogContext,
  Evaluation,
  Expectation,
} from "@acme/game";

import type { LlmEffort, LlmProvider, LlmUsage } from "./provider/types";

/**
 * Four pluggable stages make up one "approach":
 *
 *   engagement — whether the manager addressed the character at all
 *                (markers or the model)
 *   knowledge  — how the character's context is assembled (prompt / RAG /
 *                GraphRAG / anything else)
 *   persona    — how the reply is produced (plain prompting, skill policy, …)
 *   evaluation — how the dialog is scored (rules, LLM judge, hybrid)
 *
 * A {@link VariantConfig} picks one implementation per stage. Because every
 * dialog stores the variant it ran under, the admin analytics can answer the
 * only question that matters: did the new approach actually improve results?
 */

export interface StageDeps {
  provider: LlmProvider;
  catalog: Catalog;
  /** Extra parameters from the variant, e.g. `{ topK: 6 }`. */
  params: Record<string, unknown>;
  effort?: LlmEffort;
  signal?: AbortSignal;
}

export interface EngagementRequest {
  dialog: DialogContext;
  utterance: string;
}

export interface EngagementResult {
  /** Whether this utterance pulls the character into the conversation. */
  engaged: boolean;
  /** Short RU rationale, shown in the admin transcript. */
  reason?: string;
  usage?: LlmUsage;
  latencyMs: number;
}

/**
 * The gate that decides whether the character speaks at all.
 *
 * It is a separate stage because it runs *before* the persona call: a "нет"
 * here means the turn costs nothing. Whether that decision is made by markers
 * or by the model is exactly the kind of thing worth A/B-ing, so it is
 * pluggable like the rest.
 */
export interface EngagementStrategy {
  readonly id: string;
  readonly description: string;
  check(request: EngagementRequest, deps: StageDeps): Promise<EngagementResult>;
}

export interface KnowledgeSnippet {
  id: string;
  text: string;
  /** Retrieval score, 0–1. Deterministic strategies may return 1 for all. */
  score: number;
  /** Where the fact came from: "profile", "task", "methodology", "graph"… */
  source: string;
}

export interface KnowledgeRequest {
  dialog: DialogContext;
  expectation: Expectation;
  /** The manager's latest utterance, used as the retrieval query. */
  query: string;
}

export interface KnowledgeResult {
  snippets: KnowledgeSnippet[];
  usage?: LlmUsage;
  latencyMs: number;
  meta?: Record<string, unknown>;
}

export interface KnowledgeStrategy {
  readonly id: string;
  readonly description: string;
  retrieve(
    request: KnowledgeRequest,
    deps: StageDeps,
  ): Promise<KnowledgeResult>;
}

export interface PersonaReply {
  /** True while the manager has not engaged the employee yet. */
  silent: boolean;
  /** What the character says out loud (RU). Empty when `silent`. */
  reply: string;
  /** "Что я понял / переспрос" — null when the task was clear. */
  understood: string | null;
  readiness: "confident" | "unsure" | "resistant";
  /** Requests for resources or clarifications. */
  requests: string[];
  /** Whether the character confirmed the control points. */
  confirmsCheckpoints: boolean;
  /** −2 … +2 change in the character's emotional state. */
  emotionDelta: number;
}

export interface PersonaRequest {
  dialog: DialogContext;
  expectation: Expectation;
  knowledge: KnowledgeResult;
  utterance: string;
}

export interface PersonaResult {
  reply: PersonaReply;
  usage?: LlmUsage;
  latencyMs: number;
  meta?: Record<string, unknown>;
}

export interface PersonaStrategy {
  readonly id: string;
  readonly description: string;
  respond(request: PersonaRequest, deps: StageDeps): Promise<PersonaResult>;
  /**
   * Optional feedback hook: called with the final score once a dialog ends.
   * Learning approaches (bandits, skill-RL) use it to update their policy;
   * stateless approaches simply do not implement it.
   */
  learn?(feedback: PersonaFeedback): Promise<void> | void;
}

export interface PersonaFeedback {
  dialogId: string;
  variantId: string;
  evaluation: Evaluation;
  /**
   * Reward in 0…1 for the *character's* behaviour, not the manager's score.
   *
   * The two are different objectives and must not be confused: a manager may
   * legitimately score 20% while the character played its part perfectly. The
   * caller decides what "good behaviour" means — the offline harness uses
   * scoring accuracy against expert labels, the live app can use the
   * administrator's thumbs-up. Absent reward ⇒ no update.
   */
  reward?: number;
  /** Whatever the strategy put into `PersonaResult.meta` during the dialog. */
  turnMeta: Record<string, unknown>[];
}

export interface EvaluationRequest {
  dialog: DialogContext;
  expectation: Expectation;
}

export interface EvaluationResult {
  evaluation: Evaluation;
  usage?: LlmUsage;
  latencyMs: number;
  meta?: Record<string, unknown>;
}

export interface EvaluationStrategy {
  readonly id: string;
  readonly description: string;
  evaluate(
    request: EvaluationRequest,
    deps: StageDeps,
  ): Promise<EvaluationResult>;
}
