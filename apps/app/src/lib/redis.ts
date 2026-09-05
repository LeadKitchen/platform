import { env } from "@acme/config";
import type { Redis as RedisClient } from "ioredis";

/**
 * Shared Redis client — lazily created on first use (mirrors
 * `packages/ai/src/knowledge/qdrant.ts`'s pattern), so nothing that never
 * touches a Redis-backed feature needs a live instance just because this
 * module is imported. `env.REDIS_URL` unset means every caller falls back
 * to its own in-memory behaviour instead of failing the request.
 */

let clientPromise: Promise<RedisClient> | undefined;

export async function getRedisClient(): Promise<RedisClient | undefined> {
  if (!env.REDIS_URL) return undefined;
  clientPromise ??= (async () => {
    try {
      const { default: Redis } = await import("ioredis");
      const client = new Redis(env.REDIS_URL as string, {
        maxRetriesPerRequest: 1,
      });
      client.on("error", (error) => {
        console.warn(`Redis client error: ${error.message}`);
      });
      return client;
    } catch (error) {
      clientPromise = undefined;
      throw error;
    }
  })();
  try {
    return await clientPromise;
  } catch (error) {
    console.warn(
      `Redis client unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}
