/**
 * ============================================================================
 * SEJOURA - RENOUVELLEMENT DES ABONNEMENTS (FONCTIONNEL)
 * ============================================================================
 *
 * Ce module rend le cron de renouvellement utile meme sans operateurs
 * de paiement connectes :
 *
 * 1. Alerte les abonnements expirant dans 3 jours (Telegram)
 * 2. Soft-lock les abonnements expires (status=suspended, subscription_status=expired)
 * 3. Envoie une alerte quand un abonnement expire aujourd'hui
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  escapeMarkdown,
  getTelegramAdminUrl,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";
import { getPlanLabel } from "@/lib/utils";

interface ExpiringSubscription {
  tenant_id: string;
  plan: string;
  current_period_end: string;
  is_soft_locked: boolean;
  company_name: string | null;
}

async function getExpiringSubscriptions(daysAhead: number): Promise<ExpiringSubscription[]> {
  const admin = createAdminClient();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const { data, error } = await admin
    .from("subscriptions")
    .select("tenant_id, plan, current_period_end, is_soft_locked")
    .eq("status", "active")
    .lt("current_period_end", futureDate.toISOString())
    .gte("current_period_end", new Date().toISOString());

  if (error || !data) return [];

  const enriched = await Promise.all(
    data.map(async (sub) => {
      const { data: tenant } = await admin
        .from("tenants")
        .select("company_name")
        .eq("id", sub.tenant_id)
        .maybeSingle();
      return { ...sub, company_name: tenant?.company_name ?? null };
    })
  );

  return enriched;
}

async function getExpiredUnlockedSubscriptions(): Promise<ExpiringSubscription[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("subscriptions")
    .select("tenant_id, plan, current_period_end, is_soft_locked")
    .eq("status", "active")
    .lt("current_period_end", new Date().toISOString())
    .eq("is_soft_locked", false);

  if (error || !data) return [];

  const enriched = await Promise.all(
    data.map(async (sub) => {
      const { data: tenant } = await admin
        .from("tenants")
        .select("company_name")
        .eq("id", sub.tenant_id)
        .maybeSingle();
      return { ...sub, company_name: tenant?.company_name ?? null };
    })
  );

  return enriched;
}

async function sendExpiryAlert(sub: ExpiringSubscription, daysLeft: number): Promise<void> {
  if (!isTelegramConfigured()) return;

  const adminUrl = getTelegramAdminUrl("https://app.sejoura.com/admin?next=/admin/sejour");
  const endDate = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(sub.current_period_end));

  const urgency = daysLeft <= 1 ? "URGENT" : daysLeft <= 3 ? "Attention" : "Rappel";

  const text = [
    `[${urgency}] Abonnement expirant - Sejoura`,
    "",
    `Residence : ${escapeMarkdown(sub.company_name || "Etablissement inconnu")}`,
    `Formule : ${escapeMarkdown(getPlanLabel(sub.plan || "free"))}`,
    `Expire le ${escapeMarkdown(endDate)} (${daysLeft} jour${daysLeft > 1 ? "s" : ""})`,
    "",
    "Le gerant doit renouveler son abonnement pour eviter la suspension.",
    "",
    `[Voir sur le Dashboard Admin](${adminUrl})`,
  ].join("\n");

  const sent = await sendTelegramMessage(text);
  if (!sent) console.error("[SubRenewal] Telegram alert failed for " + sub.tenant_id);
}

async function softLockExpiredSubscriptions(subs: ExpiringSubscription[]): Promise<number> {
  const admin = createAdminClient();
  let lockedCount = 0;

  for (const sub of subs) {
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: "suspended",
        is_soft_locked: true,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", sub.tenant_id)
      .eq("status", "active");

    if (error) {
      console.error("[SubRenewal] Failed to lock " + sub.tenant_id + ": " + error.message);
      continue;
    }

    lockedCount++;

    if (isTelegramConfigured()) {
      const adminUrl = getTelegramAdminUrl("https://app.sejoura.com/admin?next=/admin/sejour");
      const expiryDate = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(sub.current_period_end));

      const text = [
        "ABONNEMENT EXPIRE - Sejoura",
        "",
        "Residence : " + escapeMarkdown(sub.company_name || "Etablissement inconnu"),
        "Formule : " + escapeMarkdown(getPlanLabel(sub.plan || "free")),
        "Expire le " + expiryDate,
        "",
        "L'espace a ete automatiquement suspendu.",
        "",
        "[Voir sur le Dashboard Admin](" + adminUrl + ")",
      ].join("\n");

      await sendTelegramMessage(text);
    }
  }

  return lockedCount;
}

export async function runSubscriptionRenewalCron(): Promise<{
  expiringAlerts: number;
  expiredLocked: number;
  timestamp: string;
}> {
  console.log("[SubRenewal] Demarrage du cron de renouvellement...");

  const admin = createAdminClient();
  const { error: transitionError } = await admin.rpc("apply_subscription_period_end_transitions");
  if (transitionError) {
    console.error("[SubRenewal] Period-end transition failed:", transitionError.message);
  }

  const expiringIn3Days = await getExpiringSubscriptions(3);
  let expiringAlerts = 0;
  for (const sub of expiringIn3Days) {
    const endDate = new Date(sub.current_period_end);
    const now = new Date();
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    await sendExpiryAlert(sub, daysLeft);
    expiringAlerts++;
  }

  const expired = await getExpiredUnlockedSubscriptions();
  const expiredLocked = await softLockExpiredSubscriptions(expired);

  console.log("[SubRenewal] Termine : " + expiringAlerts + " alertes, " + expiredLocked + " abonnements verrouilles.");

  return {
    expiringAlerts,
    expiredLocked,
    timestamp: new Date().toISOString(),
  };
}
