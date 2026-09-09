import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("rate-limit", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("autorise jusqu'à max requêtes puis refuse", async () => {
    const { createRateLimiter } = await import("../src/lib/rate-limit");
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, prefix: "test-max" });

    const first = await limiter.check("ip-1");
    const second = await limiter.check("ip-1");
    const third = await limiter.check("ip-1");

    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.ok).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.ok).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.resetIn).toBeGreaterThan(0);
  });

  it("isole les clés entre elles", async () => {
    const { createRateLimiter } = await import("../src/lib/rate-limit");
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, prefix: "test-iso" });

    expect((await limiter.check("a")).ok).toBe(true);
    expect((await limiter.check("b")).ok).toBe(true);
    expect((await limiter.check("a")).ok).toBe(false);
  });

  it("réouvre la fenêtre après expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const { createRateLimiter } = await import("../src/lib/rate-limit");
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1, prefix: "test-window" });

    expect((await limiter.check("k")).ok).toBe(true);
    expect((await limiter.check("k")).ok).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.050Z"));
    expect((await limiter.check("k")).ok).toBe(true);
  });

  it("extrait l'IP depuis x-forwarded-for", async () => {
    const { getRateLimitKey } = await import("../src/lib/rate-limit");
    const request = new Request("http://localhost/api", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    expect(getRateLimitKey(request)).toBe("203.0.113.10");
    expect(getRateLimitKey(request, "pin")).toBe("203.0.113.10:pin");
  });
});
