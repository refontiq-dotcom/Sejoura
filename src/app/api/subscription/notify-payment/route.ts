import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanPrice } from "@/lib/subscription-plans";
import { getPlanLabel } from "@/lib/utils";

const ALLOWED_PLANS = ["essentiel", "entreprise", "standard", "enterprise"];

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/subscription/notify-payment
// Le gérant a effectué son paiement via le lien Wave (pay.wave.com) et clique
// sur « J'ai effectué le paiement, notifier l'administrateur ».
//
// Effets :
//   1. subscription_status -> 'pending' sur l'abonnement de l'établissement
//   2. Création d'une demande de paiement (subscription_payment_requests)
//   3. Notification visuelle pour le Super Admin (validation à faire)
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const plan = typeof body.plan === "string" ? body.plan : "";

  if (!ALLOWED_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Plan invalide." }, { status: 400 });
  }

  const amount = getPlanPrice(plan);
  if (amount <= 0) {
    return NextResponse.json({ error: "Montant invalide pour ce plan." }, { status: 400 });
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
      notes: "Paiement déclaré par le gérant après paiement via lien Wave",
    })
    .select()
    .single();

  if (reqError || !requestRow) {
    return NextResponse.json(
      { error: "Impossible d'enregistrer la demande de paiement." },
      { status: 500 }
    );
  }

  // 3. Alerte visuelle pour le Super Admin (validation en attente)
  const companyName = tenant?.company_name ?? "Un établissement";
  await admin.from("notifications").insert({
    tenant_id: userData.tenant_id,
    user_id: null,
    title: "Nouvelle demande de validation d'abonnement",
    message: `${companyName} a déclaré un paiement Wave pour la formule ${getPlanLabel(plan)} (${amount} FCFA). Validez l'abonnement.`,
    type: "warning",
    link: "/admin",
  });

  return NextResponse.json({ success: true, alreadyPending: false, requestId: requestRow.id });
}
