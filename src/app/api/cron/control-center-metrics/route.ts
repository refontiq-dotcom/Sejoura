import { NextResponse } from "next/server";
import { pushControlCenterMetrics } from "@/lib/control-center-metrics";
import { getRequestId, logger } from "@/lib/logger";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const requestId = getRequestId(req);
  const expected = process.env.CRON_SECRET?.trim();

  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    logger.warn("metrics.cron.unauthorized", { request_id: requestId });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payload } = await pushControlCenterMetrics();
    logger.info("metrics.cron.completed", {
      duration_ms: Date.now() - startedAt,
      status: payload.statut_sante,
      request_id: requestId,
    });
    return NextResponse.json({ ok: true, metrics: payload });
  } catch (error) {
    logger.error("metrics.cron.failed", error, {
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
    });
    return NextResponse.json({ error: "Metrics synchronization failed" }, { status: 500 });
  }
}
