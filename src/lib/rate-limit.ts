import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Distributed rate limiting for Vercel/serverless.
 * Production must provide UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 * If the backend is unavailable, callers should fail closed for security-sensitive endpoints.
 */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, requests: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]) {
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, window),
      analytics: false,
      prefix: `sejoura:rl:${name}`,
    });
    limiters.set(name, limiter);
  }
  return limiter;
}

export async function checkRateLimit(
  name: string,
  key: string,
  requests: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("RATE_LIMIT_BACKEND_NOT_CONFIGURED");
  }
  return getLimiter(name, requests, window).limit(key);
}

export function getRateLimitKey(request: Request, suffix?: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "unknown";
  return suffix ? `${ip}:${suffix}` : ip;
}

// Kept as named helpers for existing callers.
export async function checkPinRateLimit(request: Request, userId: string) {
  return checkRateLimit("pin", getRateLimitKey(request, userId), 10, "15 m");
}

export async function checkLoginRateLimit(request: Request) {
  return checkRateLimit("login", getRateLimitKey(request), 5, "15 m");
}

export async function checkEmployeeVerifyRateLimit(request: Request) {
  return checkRateLimit("employee-verify", getRateLimitKey(request), 20, "15 m");
}
