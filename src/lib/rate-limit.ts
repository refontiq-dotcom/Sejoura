import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  prefix?: string;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetIn: number;
}

interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

function hasUpstash(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function createMemoryLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max } = options;
  const store = new Map<string, RateLimitEntry>();
  let ops = 0;

  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  };

  return {
    async check(key: string): Promise<RateLimitResult> {
      ops += 1;
      if (ops % 100 === 0) cleanup();

      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: max - 1, resetIn: Math.ceil(windowMs / 1000) };
      }

      entry.count += 1;

      const resetIn = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
      if (entry.count > max) {
        return { ok: false, remaining: 0, resetIn };
      }

      return { ok: true, remaining: max - entry.count, resetIn };
    },
  };
}

function createUpstashLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max, prefix = "rl" } = options;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
    prefix: `sejoura:${prefix}`,
    analytics: false,
  });

  return {
    async check(key: string): Promise<RateLimitResult> {
      const result = await limiter.limit(key);
      const resetIn = Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));
      return {
        ok: result.success,
        remaining: result.remaining,
        resetIn,
      };
    },
  };
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  if (hasUpstash()) return createUpstashLimiter(options);
  return createMemoryLimiter(options);
}

export function getRateLimitKey(request: Request, suffix?: string): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return suffix ? `${ip}:${suffix}` : ip;
}

export const pinRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "pin",
});

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  prefix: "login",
});

export const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  prefix: "register",
});

export const subscriptionRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "subscription",
});
