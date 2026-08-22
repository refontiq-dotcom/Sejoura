/**
 * Simple in-memory rate limiter for API routes.
 *
 * ⚠️  In serverless environments (Vercel), each instance has its own memory,
 * so this is best-effort. For production-grade rate limiting, use Upstash
 * Redis + @upstash/ratelimit.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
 *   const result = limiter.check(key);
 *   if (!result.ok) return 429;
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Time window in milliseconds (default: 60 seconds) */
  windowMs: number;
  /** Max requests per window (default: 5) */
  max: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetIn: number; // seconds until window resets
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, max } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup every 5 minutes to prevent memory leaks
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  };
  setInterval(cleanup, 5 * 60 * 1000).unref?.();

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        // New window
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: max - 1, resetIn: Math.ceil(windowMs / 1000) };
      }

      entry.count += 1;

      if (entry.count > max) {
        const resetIn = Math.ceil((entry.resetAt - now) / 1000);
        return { ok: false, remaining: 0, resetIn };
      }

      const resetIn = Math.ceil((entry.resetAt - now) / 1000);
      return { ok: true, remaining: max - entry.count, resetIn };
    },
  };
}

/**
 * Extract a rate-limit key from a request (IP + optional userId).
 */
export function getRateLimitKey(request: Request, suffix?: string): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return suffix ? `${ip}:${suffix}` : ip;
}

// Pre-built limiters for common use cases
export const pinRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 min
});

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 min
});
