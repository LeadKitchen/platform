import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const helloWorldInputSchema = z.object({
  name: z.string().trim().min(1),
});

export type HelloWorldInput = z.infer<typeof helloWorldInputSchema>;

/**
 * Simple example task. Trigger from anywhere in your app:
 *
 * ```ts
 * import { helloWorldTask } from "@acme/jobs";
 *
 * // Fire-and-forget (returns a run handle)
 * const handle = await helloWorldTask.trigger({ name: "World" });
 *
 * // Wait for the result
 * const result = await helloWorldTask.triggerAndWait({ name: "World" }).unwrap();
 * console.log(result.message); // "Hello, World!"
 * ```
 *
 * @see https://trigger.dev/docs/tasks/overview
 */
export const helloWorldTask = schemaTask({
  id: "hello-world",
  schema: helloWorldInputSchema,
  retry: { maxAttempts: 3 },
  maxDuration: 60,
  run: async (payload) => {
    return { message: `Hello, ${payload.name}!` };
  },
});
