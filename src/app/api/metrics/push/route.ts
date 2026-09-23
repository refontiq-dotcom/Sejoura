import { NextResponse } from "next/server";
import { pushControlCenterMetrics } from "@/lib/control-center-metrics";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const expected = process.env.METRICS_PUSH_SECRET?.trim();

  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    logger.warn("metrics.push.unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payload, result } = await pushControlCenterMetrics();
    logger.info("metrics.push.completed", {
      duration_ms: Date.now() - startedAt,
      status: payload.statut_sante,
    });
    return NextResponse.json({ ok: true, metrics: payload, controlCenter: result });
  } catch (error) {
    logger.error("metrics.push.failed", error, {
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "Metrics collection failed" }, { status: 500 });
  }
}
