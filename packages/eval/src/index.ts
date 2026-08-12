export { type EvalFixture, FIXTURES, SILENCE_PROBE } from "./fixtures";
export {
  ASSISTANT_REGISTER_MARKERS,
  checkPersonaAdherence,
  FORBIDDEN_PERSONA_TERMS,
  type ItemResult,
  measurePersonaDrift,
  type PersonaDrift,
  rewardFor,
  type SetScore,
  seriesByFixture,
  setScore,
  summarize,
  type VariantSummary,
} from "./metrics";
export { renderMarkdownReport } from "./report";
export {
  type MetricComparison,
  type RunOptions,
  type RunResult,
  runEvaluation,
  type VariantComparison,
} from "./runner";
export { createSimulatedProvider } from "./simulated-provider";
export {
  cohensKappa,
  comparePaired,
  kappaLabel,
  type PairedComparison,
} from "./statistics";
