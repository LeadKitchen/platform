import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev is a fully managed job queue — no server to run ourselves.
 * Local dev and deploys both talk to the cloud project identified below.
 *
 * @see https://trigger.dev/docs/config/config-file
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
