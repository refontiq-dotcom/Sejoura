import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanPrice } from "@/lib/utils";
import { getWaveErrorUrl, getWaveSuccessUrl, WAVE_BASE_URL } from "@/lib/wave";

export async function POST(request: Request) {
  if (!process.env.WAVE_API_KEY) {
    return NextResponse.json(
      { error: "La clé API Wave n'est pas configurée côté serveur." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const plan = typeof body.plan === "string" ? body.plan : "";
  const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId : "";

  if (!plan || !subscriptionId) {
    return NextResponse.json(
      { error: "Paramètres manquants pour la création de la session Wave." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Vous devez être connecté pour créer une session de paiement." },
      { status: 401 }
    );
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("auth_user_id", session.user.id)
    .single();

  if (userError || !userData?.tenant_id) {
    return NextResponse.json(
      { error: "Impossible de retrouver votre compte client." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: subscriptionData, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("id, tenant_id")
    .eq("id", subscriptionId)
    .eq("tenant_id", userData.tenant_id)
    .single();

  if (subscriptionError || !subscriptionData) {
    return NextResponse.json(
      { error: "Abonnement introuvable ou non autorisé." },
      { status: 404 }
    );
  }

  const amount = getPlanPrice(plan);
  if (amount <= 0) {
    return NextResponse.json(
      { error: "Montant invalide pour le plan choisi." },
      { status: 400 }
    );
  }

  const origin = new URL(request.url).origin;
  const success_url = getWaveSuccessUrl(origin);
  const error_url = getWaveErrorUrl(origin);

  const response = await fetch(`${WAVE_BASE_URL}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WAVE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amount.toString(),
      currency: "XOF",
      success_url,
      error_url,
      client_reference: subscriptionData.id,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data?.wave_launch_url) {
    return NextResponse.json(
      {
        error:
          data?.error?.message || data?.error || "Impossible de créer la session de paiement Wave.",
      },
      { status: response.status || 500 }
    );
  }

  return NextResponse.json({ wave_launch_url: data.wave_launch_url });
}
