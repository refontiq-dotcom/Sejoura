import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanPrice } from "@/lib/subscription-plans";
import { getPlanLabel, formatFCFA } from "@/lib/utils";
import {
  escapeMarkdown,
  getTelegramAdminUrl,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";

const ALLOWED_PLANS = ["essentiel", "croissance", "entreprise", "standard", "growth", "enterprise"];

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/subscription/notify-payment
// Le gérant a effectué son paiement via le lien Wave (pay.wave.com) et soumet
// « Soumettre pour activation rapide » avec son numéro Wave expéditeur.
//
// Effets :
//   1. subscription_status -> 'pending' sur l'abonnement de l'établissement
//   2. Création d'une demande de paiement (subscription_payment_requests)
//      avec le numéro Wave expéditeur (sender_phone)
//   3. Notification visuelle pour le Super Admin (validation à faire)
//   4. Alerte Telegram pour le Super Admin (si TELEGRAM_BOT_TOKEN et
//      TELEGRAM_CHAT_ID sont configurés, cf. src/lib/telegram.ts)
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const plan = typeof body.plan === "string" ? body.plan : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!ALLOWED_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Plan invalide." }, { status: 400 });
  }

  const amount = getPlanPrice(plan);
  if (amount <= 0) {
    return NextResponse.json({ error: "Montant invalide pour ce plan." }, { status: 400 });
  }

  const digitsOnly = phone.replace(/\D/g, "");
  if (!digitsOnly || digitsOnly.length < 8) {
    return NextResponse.json(
      { error: "Veuillez renseigner le numéro Wave ayant servi au paiement." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Vous devez être connecté." }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (userError || !userData?.tenant_id) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 400 });
  }
  if (userData.role !== "admin_residence") {
    return NextResponse.json(
      { error: "Accès réservé à l'administrateur de l'établissement." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("company_name, contact_name")
    .eq("id", userData.tenant_id)
    .maybeSingle();

  const { data: requestRow, error: requestError } = await supabase.rpc(
    "submit_subscription_payment_request",
    {
      p_user_id: userData.id,
      p_plan: plan,
      p_amount: amount,
      p_sender_phone: phone,
    }
  );

  if (requestError || !requestRow) {
    console.error("subscription payment request:", requestError);
    return NextResponse.json(
      { error: requestError?.message || "Impossible d'enregistrer la demande de paiement." },
      { status: 500 }
    );
  }

  // 3. Synchronisation avec Refontiq Control Center : le Control Center
  // devient l'unique autorité de validation globale.
  const controlCenterUrl = process.env.CONTROL_CENTER_URL?.trim();
  const metricsSecret = process.env.METRICS_PUSH_SECRET?.trim();
  if (controlCenterUrl && metricsSecret) {
    try {
      const controlResponse = await fetch(
        `${controlCenterUrl.replace(/\/$/, "")}/api/billing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${metricsSecret}`,
          },
          body: JSON.stringify({
            produit: "sejoura",
            produit_ref: requestRow.id,
            plan,
            amount,
            requested_by: userData.id,
            sender_phone: phone,
            notes: "Paiement déclaré depuis Séjoura après paiement via Wave",
          }),
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!controlResponse.ok) {
        console.error(
          "Control Center billing sync failed:",
          controlResponse.status,
          await controlResponse.text()
        );
      }
    } catch (error) {
      console.error("Control Center billing sync error:", error);
    }
  }

  // 4. Alerte visuelle locale pour conserver l'historique côté établissement.
  const companyName = tenant?.company_name ?? "Un établissement";
  await admin.from("notifications").insert({
    tenant_id: userData.tenant_id,
    user_id: null,
    title: "Nouvelle demande de validation d'abonnement",
    message: `${companyName} a déclaré un paiement Wave pour la formule ${getPlanLabel(plan)} (${amount} FCFA) depuis le numéro ${phone}. Validez l'abonnement.`,
    type: "warning",
    link: "/dashboard/subscription",
    recipient_role: "admin_residence",
  });

  // 5. Alerte Telegram (fire-and-forget) : un échec d'envoi ne doit jamais
  //    faire échouer la soumission de la demande côté gérant.
  if (isTelegramConfigured()) {
    try {
      const planLabel = getPlanLabel(plan);
      const contactName = tenant?.contact_name ?? "Gérant de l'établissement";
      const adminUrl = getTelegramAdminUrl("https://refontiq-control-center.vercel.app/admin/billing");

      const text = [
        "\uD83D\uDD14 *Nouvelle demande d'abonnement Sejoura !*",
        "",
        `\uD83C\uDFE2 *Résidence :* ${escapeMarkdown(companyName)}`,
        `\uD83D\uDC64 *Gérant :* ${escapeMarkdown(contactName)}`,
        `\uD83D\uDCE6 *Formule :* ${escapeMarkdown(planLabel)}`,
        `\uD83D\uDCB0 *Montant :* ${formatFCFA(amount)}`,
        `\uD83D\uDCF1 *Numéro Wave :* ${escapeMarkdown(phone)}`,
        "",
        `\uD83D\uDD17 [Valider dans Refontiq Control Center](${adminUrl})`,
      ].join("\n");

      const sent = await sendTelegramMessage(text);
      if (!sent) console.error("Telegram subscription alert failed");
    } catch (error) {
      // Ne jamais faire échouer la demande à cause de l'alerte
      console.error("subscription notify-payment telegram:", error);
    }
  }

  return NextResponse.json({ success: true, alreadyPending: false, requestId: requestRow.id });
}
