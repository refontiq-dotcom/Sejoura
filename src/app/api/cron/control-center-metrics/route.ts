import { NextResponse } from "next/server";
import { describePushFailure, pushControlCenterMetrics } from "@/lib/control-center-metrics";
import { getRequestId, logger } from "@/lib/logger";
import { hasValidBearer } from "@/lib/security/safe-equal";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const requestId = getRequestId(req);

  if (!hasValidBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    logger.warn("metrics.cron.unauthorized", { request_id: requestId });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payload, result, attempts } = await pushControlCenterMetrics();
    logger.info("metrics.cron.completed", {
      duration_ms: Date.now() - startedAt,
      status: payload.statut_sante,
      request_id: requestId,
    });
    return NextResponse.json({
      ok: true,
      run_id: payload.run_id,
      collected_at: payload.collected_at,
      attempts,
      control_center: { status: result.status ?? null, schema: result.schema ?? null, warnings: result.warnings ?? [] },
      metrics: payload,
    });
  } catch (error) {
    const failure = describePushFailure(error);
    logger.error("metrics.cron.failed", error, {
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
      stage: String(failure.body.stage),
      code: String(failure.body.code),
    });
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

export const dynamic = "force-dynamic";
