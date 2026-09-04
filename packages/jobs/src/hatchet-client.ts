import { Hatchet } from "@hatchet-dev/typescript-sdk";

/**
 * Hatchet Cloud (cloud.onhatchet.run) replaces Trigger.dev Cloud as the job
 * queue — only the worker process runs on our own k3s cluster (see
 * packages/jobs/src/worker.ts and k3s/worker/), the engine itself is
 * managed by Hatchet. `Hatchet.init()` reads its connection info from
 * `HATCHET_CLIENT_TOKEN` (an API token minted for a tenant, which also
 * encodes the engine's gRPC host) — see
 * https://docs.hatchet.run/home/setup#environment-variables
 */
export const hatchet = Hatchet.init();
