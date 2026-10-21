import { NextResponse } from "next/server";
import { describePushFailure, pushControlCenterMetrics } from "@/lib/control-center-metrics";
import { getRequestId, logger } from "@/lib/logger";
import { hasValidBearer } from "@/lib/security/safe-equal";

// Déclenchement manuel d'un envoi de métriques (opérateur ou automate autorisé).
export async function POST(req: Request) {
  const startedAt = Date.now();
  const requestId = getRequestId(req);

  if (!hasValidBearer(req.headers.get("authorization"), process.env.METRICS_PUSH_SECRET)) {
    logger.warn("metrics.push.unauthorized", { request_id: requestId });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payload, result, attempts } = await pushControlCenterMetrics();
    logger.info("metrics.push.completed", {
      duration_ms: Date.now() - startedAt,
      status: payload.statut_sante,
      request_id: requestId,
    });
    return NextResponse.json({ ok: true, attempts, metrics: payload, controlCenter: result });
  } catch (error) {
    const failure = describePushFailure(error);
    logger.error("metrics.push.failed", error, {
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
      stage: String(failure.body.stage),
      code: String(failure.body.code),
    });
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
