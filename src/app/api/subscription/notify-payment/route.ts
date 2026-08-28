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

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", userData.tenant_id)
    .maybeSingle();

  // Éviter les doublons : une demande déjà en attente ne doit pas être recréée
  const { data: existing } = await admin
    .from("subscription_payment_requests")
    .select("id, plan")
    .eq("tenant_id", userData.tenant_id)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, alreadyPending: true, requestId: existing.id });
  }

  // 1. Bascule du statut d'abonnement en attente de validation
  const { error: subUpdateError } = await admin
    .from("subscriptions")
    .update({ subscription_status: "pending" })
    .eq("tenant_id", userData.tenant_id);

  if (subUpdateError) {
    return NextResponse.json(
      { error: "Impossible de mettre à jour l'abonnement." },
      { status: 500 }
    );
  }

  // 2. Traçabilité : création de la demande de paiement
  const { data: requestRow, error: reqError } = await admin
    .from("subscription_payment_requests")
    .insert({
      tenant_id: userData.tenant_id,
      subscription_id: sub?.id ?? null,
      plan,
      amount,
      status: "pending",
      requested_by: userData.id,
      sender_phone: phone,
      notes: "Paiement déclaré par le gérant après paiement via lien Wave",
    })
    .select()
    .single();

  if (reqError || !requestRow) {
    return NextResponse.json(
      { error: "L'action a échoué : enregistrer la demande de paiement." },
      { status: 500 }
    );
  }

  // 3. Alerte visuelle pour le Super Admin (validation en attente)
  const companyName = tenant?.company_name ?? "Un établissement";
  await admin.from("notifications").insert({
    tenant_id: userData.tenant_id,
    user_id: null,
    title: "Nouvelle demande de validation d'abonnement",
    message: `${companyName} a déclaré un paiement Wave pour la formule ${getPlanLabel(plan)} (${amount} FCFA) depuis le numéro ${phone}. Validez l'abonnement.`,
    type: "warning",
    link: "/admin/sejour",
    recipient_role: "admin_residence",
  });

  // 4. Alerte Telegram (fire-and-forget) : un échec d'envoi ne doit jamais
  //    faire échouer la soumission de la demande côté gérant.
  if (isTelegramConfigured()) {
    try {
      const planLabel = getPlanLabel(plan);
      const contactName = tenant?.contact_name ?? "Gérant de l'établissement";
      const adminUrl = getTelegramAdminUrl("https://sejoura-lemon.vercel.app/admin/sejour");

      const text = [
        "\uD83D\uDD14 *Nouvelle demande d'abonnement Sejoura !*",
        "",
        `\uD83C\uDFE2 *Résidence :* ${escapeMarkdown(companyName)}`,
        `\uD83D\uDC64 *Gérant :* ${escapeMarkdown(contactName)}`,
        `\uD83D\uDCE6 *Formule :* ${escapeMarkdown(planLabel)}`,
        `\uD83D\uDCB0 *Montant :* ${formatFCFA(amount)}`,
        `\uD83D\uDCF1 *Numéro Wave :* ${escapeMarkdown(phone)}`,
        "",
        `\uD83D\uDD17 [Valider sur le Dashboard Admin](${adminUrl})`,
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
