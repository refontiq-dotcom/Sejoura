/**
 * ============================================================================
 * SÉJOURA — CRON : AUTO-RENOUVELLEMENT DES ABONNEMENTS
 * ============================================================================
 *
 * Route : POST /api/v1/cron/subscription-renewal
 *
 * Déclenché automatiquement chaque jour à 8h00 (UTC) :
 * - Alerte les abonnements expirant dans 3 jours (Telegram)
 * - Soft-lock les abonnements expirés (is_soft_locked = true)
 * - Notifie le Super Admin via Telegram
 *
 * Quand les opérateurs seront connectés, on ajoutera l'initiation
 * de paiement automatique dans ce même flux.
 */

import { NextRequest, NextResponse } from "next/server";
import { runSubscriptionRenewalCron } from "@/lib/payments/subscription-renewal";

export async function POST(req: NextRequest) {
  // Sécurité : vérifier le secret cron
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    console.log("[SubCron] Démarrage du cron d'auto-renouvellement des abonnements...");
    const result = await runSubscriptionRenewalCron();
    console.log("[SubCron] Cron terminé.", result);

    return NextResponse.json({
      success: true,
      message: `Cron exécuté : ${result.expiringAlerts} alertes, ${result.expiredLocked} abonnements verrouillés.`,
      ...result,
    });
  } catch (error) {
    console.error("[SubCron] Erreur:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// Également accessible en GET pour les tests manuels
export async function GET(req: NextRequest) {
  return POST(req);
}

export const dynamic = "force-dynamic";
