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

import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentService } from "@/lib/payments";
import { getPlanPrice, normalizePlan } from "@/lib/subscription-plans";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionPaymentResult = {
  success: boolean;
  method: "automatic" | "manual_fallback";
  transactionId?: string;
  checkoutUrl?: string;
  error?: string;
};

// ─── Plan Config ─────────────────────────────────────────────────────────────

export const SUBSCRIPTION_PLANS = {
  essentiel: {
    label: "Plan Essentiel",
    price: 15000, // FCFA/mois
    wavePayLink: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=15000",
    description: "Abonnement mensuel Séjoura — Plan Essentiel",
  },
  entreprise: {
    label: "Plan Entreprise",
    price: 55000, // FCFA/mois
    wavePayLink: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=55000",
    description: "Abonnement mensuel Séjoura — Plan Entreprise",
  },
} as const;

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
 * @param plan       - Plan cible ("essentiel" | "entreprise")
 * @param reference  - Référence unique (ex: "SUB-2026-08-tenantId")
 */
export async function initiateSubscriptionPayment(
  tenantId: string,
  plan: "essentiel" | "entreprise",
  reference: string
): Promise<SubscriptionPaymentResult> {
  const planConfig = SUBSCRIPTION_PLANS[plan];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sejoura-lemon.vercel.app";
  const webhookUrl = `${appUrl}/api/v1/webhooks/subscription-payments`;

  // Providers à essayer dans l'ordre de priorité
  const providerPriority = [
    "wave",
    "orange_money",
    "mtn",
    "moov_africa",
    "pi_spi",
  ] as const;

  for (const provider of providerPriority) {
    // TODO : Décommenter quand les clés API seront disponibles
    /*
    const service = await getPaymentService(tenantId, provider);
    if (!service) continue;

    const result = await service.initiatePayment({
      amount: planConfig.price,
      reference,
      description: planConfig.description,
      returnUrl: `${appUrl}/dashboard/subscription?payment=success`,
      cancelUrl: `${appUrl}/dashboard/subscription?payment=cancelled`,
      webhookUrl,
    });

    if (result.success) {
      // Enregistrer la tentative dans la table subscription_payment_intents
      await recordPaymentIntent(tenantId, plan, provider, result.transactionId!, reference);

      return {
        success: true,
        method: "automatic",
        transactionId: result.transactionId,
        checkoutUrl: result.checkoutUrl,
      };
    }
    */
    break; // Supprimer ce "break" quand les services seront connectés
  }

  // ✅ FALLBACK ACTUEL : Retourner le lien Wave manuel (comportement inchangé)
  return {
    success: false,
    method: "manual_fallback",
    checkoutUrl: planConfig.wavePayLink,
    error: "Aucun opérateur de paiement automatique configuré. Utiliser le paiement Wave manuel.",
  };
}

/**
 * Enregistre une tentative de paiement d'abonnement dans la base de données.
 * Utilisé pour le suivi et la réconciliation.
 *
 * TABLE REQUISE (à créer via migration SQL) :
 * subscription_payment_intents (
 *   id, tenant_id, plan, provider, transaction_id,
 *   reference, status, amount, created_at, updated_at
 * )
 */
async function recordPaymentIntent(
  tenantId: string,
  plan: string,
  provider: string,
  transactionId: string,
  reference: string
): Promise<void> {
  // TODO : Décommenter quand la migration SQL correspondante est appliquée
  /*
  const supabase = createAdminClient();
  await supabase.from("subscription_payment_intents").insert({
    tenant_id: tenantId,
    plan,
    provider,
    transaction_id: transactionId,
    reference,
    status: "pending",
    amount: getPlanPrice(plan),
  });
  */
  console.log(`[SubPayment] Intent recorded: ${provider} - ${transactionId} - ${reference}`);
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
  provider: string,
  transactionId: string,
  providerStatus: string
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
