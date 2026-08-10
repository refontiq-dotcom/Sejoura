import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
    const name = typeof body?.name === "string" ? body.name : "API Séjoura";

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId requis" }, { status: 400 });
    }

    const admin = createAdminClient();
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
