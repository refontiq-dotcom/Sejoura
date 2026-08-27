import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client (server-side only).
 *
 * Uses the REST API, so no connection pooling issues in serverless environments.
 * ⚠️  Never import this from client components — the token must stay server-side.
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
