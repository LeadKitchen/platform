import {
  createMockProvider,
  fallbackResponder,
  resolveVariant,
} from "@acme/ai";

import { FIXTURES } from "./src/fixtures";
import {
  buildJudgeCorpus,
  defaultCorpusPath,
} from "./src/optimize/judge-corpus";

const provider = createMockProvider(fallbackResponder);
const variant = resolveVariant("baseline-judge");
const fixtures = FIXTURES.slice(0, 3);
const cachePath = defaultCorpusPath("tmp-verify");

const first = await buildJudgeCorpus({
  fixtures,
  variant,
  provider,
  cachePath,
  refresh: true,
  onProgress: (message) => console.log(`[1] ${message}`),
});

const second = await buildJudgeCorpus({
  fixtures,
  variant,
  provider,
  cachePath,
  onProgress: (message) => console.log(`[2] ${message}`),
});

console.log("samples:", first.length, "cache reuse:", second.length);
console.log("ids:", first.map((sample) => sample.fixtureId).join(", "));
const sample = first[0];
if (!sample) throw new Error("корпус пуст");
console.log("--- transcript ---");
console.log(sample.transcript);
console.log("--- criteria ---");
console.log(sample.criteriaList);
console.log("resolvedExpectedStyle:", sample.resolvedExpectedStyle);
console.log("label:", JSON.stringify(sample.label));
console.log(
  "cache identical:",
  JSON.stringify(first) === JSON.stringify(second),
);
