import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const scopes: string[] = keyData.scopes || [];
    if (!scopes.includes("bookings")) {
      return NextResponse.json({ error: "Le scope 'bookings' est requis" }, { status: 403 });
    }

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", keyData.tenant_id)
      .maybeSingle();

    if (!subscription || subscription.plan !== "entreprise") {
      return NextResponse.json({ error: "Cette clé API est réservée à la formule Entreprise" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const { data, error: rpcError } = await admin.rpc("update_booking_api", {
      p_booking_id: id,
      p_tenant_id: keyData.tenant_id,
      p_check_in_date: typeof body?.check_in_date === "string" ? body.check_in_date : null,
      p_check_out_date: typeof body?.check_out_date === "string" ? body.check_out_date : null,
      p_negotiated_price: typeof body?.negotiated_price === "number" ? body.negotiated_price : null,
      p_special_requests: typeof body?.special_requests === "string" ? body.special_requests : null,
      p_number_of_guests: typeof body?.number_of_guests === "number" ? body.number_of_guests : null,
      p_payment_method: typeof body?.payment_method === "string" ? body.payment_method : null,
      p_mobile_money_operator: typeof body?.mobile_money_operator === "string" ? body.mobile_money_operator : null,
    });

    if (rpcError) {
      const msg = rpcError.message || "Erreur inconnue";
      const status = msg.includes("BOOKING_NOT_FOUND")
        ? 404
        : msg.includes("UNAUTHORIZED")
          ? 403
          : msg.includes("BOOKING_NOT_MODIFIABLE")
            ? 409
            : msg.includes("DOUBLE_BOOKING") ||
                msg.includes("INVALID_DATES") ||
                msg.includes("INVALID_PRICE") ||
                msg.includes("CHECKED_IN_DATE_CONFLICT") ||
                msg.includes("INVALID_PAYMENT_METHOD")
              ? 400
              : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
