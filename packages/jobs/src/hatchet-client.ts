import { Hatchet } from "@hatchet-dev/typescript-sdk";

/**
 * Hatchet Cloud (cloud.onhatchet.run) replaces Trigger.dev Cloud as the job
 * queue — only the worker process runs on our own k3s cluster (see
 * packages/jobs/src/worker.ts and k3s/worker/), the engine itself is
 * managed by Hatchet. `Hatchet.init()` reads its connection info from
 * `HATCHET_CLIENT_TOKEN` (an API token minted for a tenant, which also
 * encodes the engine's gRPC host) — see
 * https://docs.hatchet.run/home/setup#environment-variables
 *
 * Task definitions (packages/jobs/src/trigger/*) call `hatchet.task()` at
 * module scope, and those modules are imported transitively by nearly
 * every Next.js API route through `@acme/api` — so `next build` loads
 * this module too while collecting route configuration, well before
 * `HATCHET_CLIENT_TOKEN` is available. Fall back to a stub client during
 * that build-time collection so it doesn't need a real token; the stub's
 * `task()` returns definitions whose `run`/`runNoWait` throw if actually
 * invoked, which can't happen at build time since nothing calls them.
 */
export const hatchet: Hatchet =
  process.env.NEXT_PHASE === "phase-production-build"
    ? createBuildStub()
    : Hatchet.init();

function createBuildStub(): Hatchet {
  const unavailable = () => {
    throw new Error(
      "Hatchet task invoked during `next build` — tasks should only run via the worker or at request time.",
    );
  };
  return {
    task: () => ({ run: unavailable, runNoWait: unavailable }),
    workflow: () => ({
      onFailure: () => undefined,
      task: () => undefined,
    }),
    worker: unavailable,
  } as unknown as Hatchet;
}
