import { defineConfig } from "@trigger.dev/sdk";
import { z } from "zod";

const triggerProjectRef = z
  .string()
  .trim()
  .min(1)
  .parse(process.env.TRIGGER_PROJECT_REF);

/**
 * Trigger.dev is a fully managed job queue — no server to run ourselves.
 * Local dev and deploys both talk to the cloud project identified below.
 *
 * @see https://trigger.dev/docs/config/config-file
 */
export default defineConfig({
  project: triggerProjectRef,
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
