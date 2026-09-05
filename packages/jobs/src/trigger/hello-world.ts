import { z } from "zod";
import { hatchet } from "../hatchet-client";

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
 * // Wait for the result
 * const result = await helloWorldTask.run({ name: "World" });
 * console.log(result.message); // "Hello, World!"
 *
 * // Fire-and-forget
 * await helloWorldTask.runNoWait({ name: "World" });
 * ```
 *
 * @see https://docs.hatchet.run/home/your-first-task
 */
export const helloWorldTask = hatchet.task<
  HelloWorldInput,
  { message: string }
>({
  name: "hello-world",
  retries: 3,
  executionTimeout: "60s",
  fn: async (input) => {
    const payload = helloWorldInputSchema.parse(input);
    return { message: `Hello, ${payload.name}!` };
  },
});
