import { NextResponse } from "next/server";
import { expireAndUnpublishAdvertisements } from "@/lib/trouvetou/ads";
import { syncListingsToTrouvetou } from "@/lib/trouvetou/sync";
import { pushControlCenterMetrics } from "@/lib/control-center-metrics";
import { getRequestId, logger } from "@/lib/logger";

/**
 * SÉJOURA — Tâche cron quotidienne unifiée.
 *
 * Le plan Vercel Hobby limite à 2 cron jobs max, exécutables au plus une
 * fois par jour chacun. Avant ce fichier, vercel.json en déclarait 4 (dont
 * un horaire), ce qui a fait rejeter les déploiements depuis le 19/09 sans
 * message clair côté GitHub → Vercel.
 *
 * Ce endpoint regroupe donc en une seule invocation quotidienne :
 *   - l'expiration/dépublication des annonces (ex /api/cron/ads-expire)
 *   - la synchro catalogue Trouvetou (ex /api/trouvetou/sync, en GET cron)
 *   - la remontée de métriques vers Refontiq Control Center
 *     (ex /api/cron/control-center-metrics, réduit d'horaire à quotidien)
 *
 * Chaque étape est indépendante : l'échec de l'une n'empêche pas les
 * suivantes de s'exécuter. Le détail par étape est renvoyé dans la réponse
 * pour rester diagnostiquable.
 *
 * Les routes individuelles (/api/cron/ads-expire, /api/trouvetou/sync,
 * /api/cron/control-center-metrics) restent en place, appelables
 * manuellement — seul vercel.json ne les déclenche plus directement.
 */

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const startedAt = Date.now();
  const results: Record<string, { ok: boolean; data?: unknown; error?: string }> = {};

  try {
    results.ads_expire = { ok: true, data: await expireAndUnpublishAdvertisements() };
  } catch (error) {
    logger.error("daily-tasks.ads_expire.failed", error, { request_id: requestId });
    results.ads_expire = { ok: false, error: error instanceof Error ? error.message : "Erreur inconnue" };
  }

  try {
    const sync = await syncListingsToTrouvetou();
    results.trouvetou_sync = sync.ok ? { ok: true, data: sync } : { ok: false, error: sync.error };
  } catch (error) {
    logger.error("daily-tasks.trouvetou_sync.failed", error, { request_id: requestId });
    results.trouvetou_sync = { ok: false, error: error instanceof Error ? error.message : "Erreur inconnue" };
  }

  try {
    const { payload } = await pushControlCenterMetrics();
    results.control_center_metrics = { ok: true, data: { status: payload.statut_sante } };
  } catch (error) {
    logger.error("daily-tasks.control_center_metrics.failed", error, { request_id: requestId });
    results.control_center_metrics = { ok: false, error: error instanceof Error ? error.message : "Erreur inconnue" };
  }

  const allOk = Object.values(results).every((r) => r.ok);
  logger.info("daily-tasks.completed", { duration_ms: Date.now() - startedAt, all_ok: allOk, request_id: requestId });

  return NextResponse.json({ ok: allOk, results });
}

export async function POST(req: Request) {
  return GET(req);
}

export const dynamic = "force-dynamic";
