import { hatchet } from "./hatchet-client";
import { helloWorldTask } from "./trigger/hello-world";
import {
  chunkAndClassifyTask,
  embedAndIndexQdrantTask,
  embedAndPersistTask,
  extractContentTask,
  extractFactsTask,
  extractGraphTask,
  ingestKnowledgeDocumentTask,
} from "./trigger/ingest-knowledge-document";
import { scheduledTask } from "./trigger/scheduled";

/**
 * Long-running worker process — replaces Trigger.dev Cloud's managed
 * execution. Deployed to our own k3s cluster alongside the self-hosted
 * Hatchet engine; it registers every task (including the sub-tasks the
 * `ingest-knowledge-document` orchestrator calls via `.run()`/`.runNoWait()`)
 * and long-polls the engine for work.
 *
 * @see https://docs.hatchet.run/home/workers
 */
async function main() {
  const worker = await hatchet.worker("acme-jobs-worker", {
    workflows: [
      helloWorldTask,
      scheduledTask,
      ingestKnowledgeDocumentTask,
      extractContentTask,
      chunkAndClassifyTask,
      embedAndPersistTask,
      embedAndIndexQdrantTask,
      extractGraphTask,
      extractFactsTask,
    ],
  });

  await worker.start();
}

main().catch((error) => {
  console.error("Hatchet worker failed to start", error);
  process.exit(1);
});
