import { Hatchet } from "@hatchet-dev/typescript-sdk";

/**
 * Self-hosted Hatchet (running on our own k3s cluster) replaces Trigger.dev
 * Cloud as the job queue. `Hatchet.init()` reads its connection info from
 * `HATCHET_CLIENT_TOKEN` (an API token minted for a tenant, which also
 * encodes the engine's gRPC host) — see
 * https://docs.hatchet.run/home/setup#environment-variables
 */
export const hatchet = Hatchet.init();
