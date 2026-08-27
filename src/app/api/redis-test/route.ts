import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET() {
  try {
    const start = Date.now();
    await redis.set("sejoura:redis-test", "ok", { ex: 60 });
    const value = await redis.get("sejoura:redis-test");
    const latency = Date.now() - start;

    return NextResponse.json({
      status: "connected",
      test: value,
      latency_ms: latency,
      url: process.env.UPSTASH_REDIS_REST_URL
        ? `✅ (${new URL(process.env.UPSTASH_REDIS_REST_URL).hostname})`
        : "❌ UPSTASH_REDIS_REST_URL missing",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
