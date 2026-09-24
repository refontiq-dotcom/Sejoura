/**
 * ============================================================================
 * SÉJOURA — SERVICE DE PAIEMENT AUTOMATIQUE DES ABONNEMENTS
 * ============================================================================
 *
 * Ce fichier prépare le terrain pour le renouvellement automatique des
 * abonnements via les opérateurs mobiles (Wave, Orange Money, MTN, etc.)
 *
 * ⚠️  MÉTHODE ACTUELLE (ne pas modifier) :
 * ──────────────────────────────────────────
 * Le gérant clique sur un lien Wave → paie manuellement → saisit son
 * numéro dans le formulaire → l'admin Séjoura valide manuellement.
 * Cette méthode reste INTACTE et fonctionnelle.
 *
 * 🚀  MÉTHODE FUTURE (ce fichier) :
 * ──────────────────────────────────
 * Le gérant configure ses coordonnées de paiement une fois (dans Paramètres).
 * Chaque mois, Séjoura initie automatiquement une demande de paiement
 * via Wave/OM/MTN. Le gérant confirme sur son téléphone. L'abonnement
 * se renouvelle automatiquement sans intervention humaine.
 *
 * Architecture :
 * ──────────────
 * 1. Table `subscription_payment_intents` : Tentatives de paiement automatique
 * 2. Table `tenant_billing_profiles`      : Coordonnées de paiement du gérant
 * 3. Cron Job (pg_cron)                   : Déclenche les paiements à J-3
 * 4. Webhook                              : Confirme et renouvelle l'abonnement
 *
 * Flux complet :
 * ─────────────────────────────────────────────────────────────────────────
 * [J-3] Cron → subscription_payment_intents (status: pending)
 *     → Appel API opérateur → Notification push sur téléphone gérant
 * [Gérant confirme] → Webhook opérateur → subscription renouvellée
 * [Échec/Timeout]   → Webhook → is_soft_locked = true → email/Telegram
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getPlanPrice, getWavePayLink } from "@/lib/subscription-plans";
import { getPlanLabel } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionPaymentResult = {
  success: boolean;
  method: "automatic" | "manual_fallback";
  transactionId?: string;
  checkoutUrl?: string;
  error?: string;
};

// ─── Plan Config ─────────────────────────────────────────────────────────────
// Dérivée de src/lib/subscription-plans.ts (source de vérité unique des prix)
// pour éviter toute divergence entre ce fichier et la grille tarifaire réelle.

const PLAN_KEYS = ["essentiel", "croissance", "entreprise"] as const;

export const SUBSCRIPTION_PLANS = Object.fromEntries(
  PLAN_KEYS.map((key) => [
    key,
    {
      label: `Plan ${getPlanLabel(key)}`,
      price: getPlanPrice(key), // FCFA/mois
      wavePayLink: getWavePayLink(key),
      description: `Abonnement mensuel Séjoura — Plan ${getPlanLabel(key)}`,
    },
  ])
) as Record<(typeof PLAN_KEYS)[number], { label: string; price: number; wavePayLink: string; description: string }>;

// ─── Service de paiement d'abonnement ────────────────────────────────────────

/**
 * Tente d'initier un paiement automatique pour le renouvellement d'abonnement.
 *
 * PRIORITÉ : Wave → Orange Money → MTN → Moov Africa → PI-SPI → Fallback Manuel
 *
 * Si aucun opérateur n'est configuré et actif pour ce tenant, retourne
 * method="manual_fallback" avec le lien Wave manuel, pour que l'UI
 * affiche le flux de paiement actuel (aucune régression).
 *
 * @param tenantId   - UUID du tenant (gérant)
 * @param plan       - Plan cible ("essentiel" | "croissance" | "entreprise")
 * @param reference  - Référence unique (ex: "SUB-2026-08-tenantId")
 */
export async function initiateSubscriptionPayment(
  tenantId: string,
  plan: "essentiel" | "croissance" | "entreprise",
): Promise<SubscriptionPaymentResult> {
  const planConfig = SUBSCRIPTION_PLANS[plan];
  // ✅ FALLBACK ACTUEL : Retourner le lien Wave manuel (comportement inchangé)
  return {
    success: false,
    method: "manual_fallback",
    checkoutUrl: planConfig.wavePayLink,
    error: "Aucun opérateur de paiement automatique configuré. Utiliser le paiement Wave manuel.",
  };
}

/**
 * Traite la confirmation d'un webhook de paiement d'abonnement.
 * Appelé depuis /api/v1/webhooks/subscription-payments
 *
 * Si le paiement est validé par l'opérateur :
 * → Renouvelle l'abonnement (current_period_end + 30 jours)
 * → Déverrouille le tenant (is_soft_locked = false)
 * → Enregistre le paiement dans l'historique
 */
export async function processSubscriptionPaymentWebhook(
): Promise<{ success: boolean; message: string }> {
  // TODO : Décommenter quand les webhooks seront connectés
  /*
  const supabase = createAdminClient();
  const isSuccessful = ["successful", "SUCCESS", "complete", "completed"].includes(providerStatus);

  // 1. Retrouver l'intent de paiement
  const { data: intent } = await supabase
    .from("subscription_payment_intents")
    .select("*")
    .eq("provider", provider)
    .eq("transaction_id", transactionId)
    .eq("status", "pending")
    .maybeSingle();

  if (!intent) {
    return { success: false, message: "Intent de paiement introuvable" };
  }

  // 2. Mettre à jour l'intent
  await supabase
    .from("subscription_payment_intents")
    .update({ status: isSuccessful ? "successful" : "failed" })
    .eq("id", intent.id);

  if (!isSuccessful) {
    return { success: false, message: "Paiement échoué" };
  }

  // 3. Renouveler l'abonnement
  const newPeriodEnd = new Date();
  newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

  await supabase
    .from("subscriptions")
    .update({
      status: "active",
      is_soft_locked: false,
      last_payment_at: new Date().toISOString(),
      last_payment_amount: getPlanPrice(intent.plan),
      current_period_start: new Date().toISOString(),
      current_period_end: newPeriodEnd.toISOString(),
    })
    .eq("tenant_id", intent.tenant_id);

  return { success: true, message: "Abonnement renouvelé avec succès" };
  */

  console.warn("[SubPaymentWebhook] Non connecté — Webhooks non encore configurés.");
  return { success: false, message: "WEBHOOK_NOT_CONNECTED" };
}

/**
 * Cron Job : À appeler toutes les nuits via pg_cron ou Vercel Cron.
 * Vérifie les abonnements expirant dans 3 jours et déclenche les paiements.
 *
 * Pour activer dans Supabase pg_cron :
 * SELECT cron.schedule(
 *   'auto-renew-subscriptions',
 *   '0 8 * * *',   -- Tous les jours à 8h00
 *   'SELECT net.http_post(''https://sejoura-lemon.vercel.app/api/v1/cron/subscription-renewal'', ''{}'');'
 * );
 */
export async function triggerAutoRenewalCron(): Promise<void> {
  // TODO : Implémenter quand les opérateurs sont connectés
  /*
  const supabase = createAdminClient();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const { data: expiringSubscriptions } = await supabase
    .from("subscriptions")
    .select("tenant_id, plan")
    .eq("status", "active")
    .lt("current_period_end", threeDaysFromNow.toISOString());

  for (const sub of expiringSubscriptions ?? []) {
    const plan = normalizePlan(sub.plan) as "essentiel" | "entreprise";
    const reference = `SUB-${new Date().toISOString().slice(0, 7)}-${sub.tenant_id}`;
    await initiateSubscriptionPayment(sub.tenant_id, plan, reference);
  }
  */
  console.log("[SubCron] triggerAutoRenewalCron — Non encore connecté.");
}
