/**
 * ============================================================================
 * SÉJOURA — CRON : AUTO-RENOUVELLEMENT DES ABONNEMENTS
 * ============================================================================
 *
 * Route : POST /api/v1/cron/subscription-renewal
 *
 * Déclenché automatiquement chaque jour à 8h00 (UTC) pour tenter
 * le renouvellement automatique des abonnements qui expirent dans 3 jours.
 *
 * Pour activer via Vercel Cron (vercel.json) :
 * {
 *   "crons": [{
 *     "path": "/api/v1/cron/subscription-renewal",
 *     "schedule": "0 8 * * *"
 *   }]
 * }
 *
 * Ou via pg_cron Supabase (appel HTTP) :
 * SELECT cron.schedule(
 *   'auto-renew-subscriptions',
 *   '0 8 * * *',
 *   $$SELECT net.http_post(
 *     'https://sejoura-lemon.vercel.app/api/v1/cron/subscription-renewal',
 *     '{}',
 *     headers := '{"x-cron-secret": "VOTRE_SECRET"}'::jsonb
 *   )$$
 * );
 *
 * ⚠️  MÉTHODE ACTUELLE INCHANGÉE :
 * Cette route est un NO-OP tant que les opérateurs ne sont pas configurés.
 * Elle ne touche à rien et n'a aucun effet de bord.
 */

import { NextRequest, NextResponse } from "next/server";
import { triggerAutoRenewalCron } from "@/lib/payments/subscription-payment";

export async function POST(req: NextRequest) {
  // Sécurité : vérifier le secret cron (à configurer en variable d'environnement)
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    console.log("[SubCron] Démarrage du cron d'auto-renouvellement des abonnements...");
    await triggerAutoRenewalCron();
    console.log("[SubCron] Cron terminé.");

    return NextResponse.json({
      success: true,
      message: "Cron d'auto-renouvellement exécuté (stubs actifs — aucun paiement initié).",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SubCron] Erreur:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// Également accessible en GET pour les tests manuels depuis le navigateur
export async function GET(req: NextRequest) {
  return POST(req);
}

export const dynamic = "force-dynamic";
