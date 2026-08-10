import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("x-api-key") || request.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!apiKey) {
      return NextResponse.json({ error: "Clé API manquante" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: keyData, error } = await admin
      .from("external_api_keys")
      .select("tenant_id, is_active, scopes")
      .eq("api_key", apiKey)
      .maybeSingle();

    if (error || !keyData || !keyData.is_active) {
      return NextResponse.json({ error: "Clé API invalide" }, { status: 401 });
    }

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", keyData.tenant_id)
      .maybeSingle();

    if (!subscription || subscription.plan !== "entreprise") {
      return NextResponse.json({ error: "Cette clé API est réservée à la formule Entreprise" }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, booking_code, status, check_in_date, check_out_date, total_amount")
      .eq("tenant_id", keyData.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({ bookings: bookings || [] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
