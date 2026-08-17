import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  escapeMarkdown,
  getTelegramAdminUrl,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";
import { getPlanLabel } from "@/lib/utils";

// ============================================================================
// GET /api/cron/telegram-alerts
//
// Vercel Cron (toutes les minutes, cf. vercel.json) : vide la table
// "telegram_alerts" (outbox) remplie par les déclencheurs SQL qui ne passent
// pas par une route Next.js — ex. passage d'un abonnement en 'expired' par
// sync_subscription_statuses() (migration 20260828_subscription_expired_telegram.sql).
//
// Authentification : en-tête "Authorization: Bearer <CRON_SECRET>". Vercel
// l'injecte automatiquement si la variable d'environnement CRON_SECRET est
// définie. Si CRON_SECRET n'est pas configuré, la route s'exécute quand même
// (utile en développement).
// ============================================================================

interface TelegramAlert {
  id: string;
  event_type: string;
  payload: {
    tenant_id?: string;
    company_name?: string;
    plan?: string;
    subscription_end_date?: string | null;
  };
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // CRON_SECRET non configuré : toléré en dev
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function buildMessage(alert: TelegramAlert): string {
  const adminUrl = getTelegramAdminUrl("https://app.sejoura.com/admin?next=/admin/sejour");
  const { payload } = alert;

  switch (alert.event_type) {
    case "subscription_expired": {
      const endDate = payload.subscription_end_date
        ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(
            new Date(payload.subscription_end_date)
          )
        : "date inconnue";
      return [
        "\uD83D\uDD34 *Abonnement expiré — Sejoura*",
        "",
        `\uD83C\uDFE2 *Résidence :* ${escapeMarkdown(payload.company_name || "Établissement inconnu")}`,
        `\uD83D\uDCE6 *Formule :* ${escapeMarkdown(getPlanLabel(payload.plan || "free"))}`,
        `\u23F3 *Expiré depuis le* ${escapeMarkdown(endDate)}`,
        "",
        `\uD83D\uDD17 [Voir sur le Dashboard Admin](${adminUrl})`,
      ].join("\n");
    }
    default:
      return `\uD83D\uDD14 *Alerte Séjoura* — ${escapeMarkdown(alert.event_type)}`;
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  if (!isTelegramConfigured()) {
    return NextResponse.json({ sent: 0, skipped: true });
  }

  const admin = createAdminClient();

  const { data: alerts, error } = await admin
    .from("telegram_alerts")
    .select("id, event_type, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("telegram-alerts cron: read failed", error);
    return NextResponse.json({ error: "Impossible de lire les alertes." }, { status: 500 });
  }

  const pending = (alerts ?? []) as unknown as TelegramAlert[];
  let sent = 0;

  for (const alert of pending) {
    try {
      const ok = await sendTelegramMessage(buildMessage(alert));
      const nextStatus = ok ? "sent" : "failed";
      await admin
        .from("telegram_alerts")
        .update({ status: nextStatus, sent_at: ok ? new Date().toISOString() : null })
        .eq("id", alert.id);
      if (ok) sent += 1;
      else console.error("telegram-alerts cron: send failed for", alert.id);
    } catch (err) {
      console.error("telegram-alerts cron: alert failed", alert.id, err);
      await admin
        .from("telegram_alerts")
        .update({ status: "failed" })
        .eq("id", alert.id);
    }
  }

  return NextResponse.json({ sent, total: pending.length });
}

export const dynamic = "force-dynamic";
