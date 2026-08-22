import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    // ── Authentification requise ──────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    // Vérifier que l'utilisateur est admin_residence ou super_admin
    const admin = createAdminClient();
    const { data: userProfile } = await admin
      .from("users")
      .select("role, tenant_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!userProfile || (userProfile.role !== "admin_residence" && userProfile.role !== "super_admin")) {
      return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
    }

    const body = await request.json();
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
    const name = typeof body?.name === "string" ? body.name : "API Séjoura";

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId requis" }, { status: 400 });
    }

    // Vérifier que l'admin appartient bien au tenant demandé
    if (userProfile.role !== "super_admin" && userProfile.tenant_id !== tenantId) {
      return NextResponse.json({ error: "Accès refusé à cet établissement." }, { status: 403 });
    }

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!subscription || subscription.plan !== "entreprise") {
      return NextResponse.json({ error: "Les clés API sont réservées à la formule Entreprise" }, { status: 403 });
    }

    const apiKey = crypto.randomBytes(24).toString("hex");
    const { data, error } = await admin.from("external_api_keys").insert({
      tenant_id: tenantId,
      name,
      api_key: apiKey,
      scopes: ["availability", "bookings"],
      is_active: true,
    }).select().single();

    if (error || !data) {
      return NextResponse.json({ error: "Impossible de créer la clé API" }, { status: 500 });
    }

    return NextResponse.json({ key: apiKey, apiKey: apiKey, id: data.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
