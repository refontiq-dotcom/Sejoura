import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatFCFA } from "@/lib/utils";
import { getAdCampaignPrice, getAdAudienceLabel, type AdAudience } from "@/lib/ads";
import {
  escapeMarkdown,
  getTelegramAdminUrl,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const advertisementId = typeof body.advertisementId === "string" ? body.advertisementId : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!advertisementId) {
    return NextResponse.json({ error: "Identifiant de publicité manquant." }, { status: 400 });
  }

  const digitsOnly = phone.replace(/\D/g, "");
  if (!digitsOnly || digitsOnly.length < 8) {
    return NextResponse.json(
      { error: "Veuillez renseigner le numéro Wave ayant servi au paiement." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Vous devez être connecté." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from("users")
    .select("id, tenant_id, role")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (!userData?.tenant_id || userData.role !== "admin_residence") {
    return NextResponse.json(
      { error: "Accès réservé à l'administrateur de l'établissement." },
      { status: 403 }
    );
  }

  const { data: ad } = await admin
    .from("advertisements")
    .select("*")
    .eq("id", advertisementId)
    .eq("tenant_id", userData.tenant_id)
    .maybeSingle();

  if (!ad) {
    return NextResponse.json({ error: "Publicité introuvable." }, { status: 404 });
  }

  if (ad.status === "active") {
    return NextResponse.json({ error: "Cette publicité est déjà active." }, { status: 409 });
  }

  const expectedAmount = getAdCampaignPrice(ad.duration_days);
  if (expectedAmount <= 0 || ad.amount !== expectedAmount) {
    return NextResponse.json({ error: "Montant de campagne invalide." }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("advertisement_payment_requests")
    .select("id")
    .eq("advertisement_id", advertisementId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, alreadyPending: true, requestId: existing.id });
  }

  const { error: adUpdateError } = await admin
    .from("advertisements")
    .update({ status: "pending_payment", sender_phone: phone })
    .eq("id", advertisementId)
    .eq("tenant_id", userData.tenant_id);

  if (adUpdateError) {
    return NextResponse.json({ error: "Impossible de mettre à jour la publicité." }, { status: 500 });
  }

  const { data: requestRow, error: reqError } = await admin
    .from("advertisement_payment_requests")
    .insert({
      tenant_id: userData.tenant_id,
      advertisement_id: advertisementId,
      amount: ad.amount,
      duration_days: ad.duration_days,
      status: "pending",
      requested_by: userData.id,
      sender_phone: phone,
      notes: "Paiement déclaré par le gérant après paiement Wave d'une publicité",
    })
    .select()
    .single();

  if (reqError || !requestRow) {
    return NextResponse.json(
      { error: "L'action a échoué : enregistrer la demande de paiement." },
      { status: 500 }
    );
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("company_name, contact_name")
    .eq("id", userData.tenant_id)
    .maybeSingle();

  const companyName = tenant?.company_name ?? "Un établissement";
  const targeting = (ad.targeting ?? {}) as { audience?: AdAudience; cities?: string[] };
  const audienceLabel = getAdAudienceLabel(targeting.audience ?? "all");

  await admin.from("notifications").insert({
    tenant_id: userData.tenant_id,
    user_id: null,
    title: "Nouvelle demande de validation de publicité",
    message: `${companyName} a déclaré un paiement Wave de ${ad.amount} FCFA pour la publicité « ${ad.title} » (${ad.duration_days} jours) depuis le numéro ${phone}. Confirmez le paiement.`,
    type: "warning",
    link: "/admin/sejour",
    recipient_role: "admin_residence",
  });

  if (isTelegramConfigured()) {
    try {
      const contactName = tenant?.contact_name ?? "Gérant de l'établissement";
      const adminUrl = getTelegramAdminUrl("https://sejoura-lemon.vercel.app/admin/sejour");
      const cities = (targeting.cities ?? []).join(", ") || "Non précisé";
      const text = [
        "Nouvelle demande de publicité Sejoura !",
        "",
        `*Résidence :* ${escapeMarkdown(companyName)}`,
        `*Gérant :* ${escapeMarkdown(contactName)}`,
        `*Campagne :* ${escapeMarkdown(ad.title)}`,
        `*Durée :* ${ad.duration_days} jours`,
        `*Ciblage :* ${escapeMarkdown(audienceLabel)} — ${escapeMarkdown(cities)}`,
        `*Montant :* ${formatFCFA(ad.amount)}`,
        `*Numéro Wave :* ${escapeMarkdown(phone)}`,
        "",
        `[Confirmer le paiement](${adminUrl})`,
      ].join("\n");
      const sent = await sendTelegramMessage(text);
      if (!sent) console.error("Telegram advertisement alert failed");
    } catch (error) {
      console.error("ads notify-payment telegram:", error);
    }
  }

  return NextResponse.json({ success: true, alreadyPending: false, requestId: requestRow.id });
}
