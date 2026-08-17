import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/external/bookings/cancel
// Annule une réservation depuis un portail externe (ex : Trouvetou).
// Authentification : `x-api-key: <clé>` ou `Authorization: Bearer <clé>`.
//
// Corps attendu :
//   {
//     "booking_id": "<UUID de la réservation>",
//     "reason": "..." | null
//   }
//
// Vérifie que la réservation appartient au tenant, puis appelle la fonction
// `cancel_booking` (statut `cancelled`, la chambre occupée est libérée).
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
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

    const scopes = keyData.scopes || [];
    if (!scopes.includes("bookings")) {
      return NextResponse.json(
        { error: "Cette clé API n'a pas le scope 'bookings'" },
        { status: 403 }
      );
    }

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", keyData.tenant_id)
      .maybeSingle();

    if (!subscription || subscription.plan !== "entreprise") {
      return NextResponse.json(
        { error: "Cette clé API est réservée à la formule Entreprise" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }

    const { booking_id, reason } = body;
    if (!booking_id || typeof booking_id !== "string") {
      return NextResponse.json({ error: "booking_id est requis" }, { status: 400 });
    }

    const tenantId = keyData.tenant_id;

    // La réservation doit appartenir au tenant
    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .select("id, tenant_id, booking_code, status, check_in_date, check_out_date, total_amount")
      .eq("id", booking_id)
      .maybeSingle();

    if (bErr || !booking) {
      return NextResponse.json({ error: "Réservation introuvable" }, { status: 404 });
    }
    if (booking.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: "Cette réservation ne dépend pas de votre résidence" },
        { status: 403 }
      );
    }

    // Résoudre l'utilisateur qui annule : un admin actif de la résidence
    const { data: ownerUser } = await admin
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "admin_residence")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!ownerUser) {
      return NextResponse.json(
        { error: "Aucun administrateur actif trouvé pour cette résidence" },
        { status: 500 }
      );
    }

    const { data: cancelled, error: cancelErr } = await admin.rpc("cancel_booking", {
      p_booking_id: booking_id,
      p_user_id: ownerUser.id,
      p_reason: reason ? String(reason) : null,
    });

    if (cancelErr) {
      if (cancelErr.message.includes("CANCEL_FAILED")) {
        return NextResponse.json(
          { error: "Réservation introuvable ou déjà terminée" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Erreur lors de l'annulation de la réservation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: cancelled.id,
        booking_code: cancelled.booking_code,
        status: cancelled.status,
        check_in_date: cancelled.check_in_date,
        check_out_date: cancelled.check_out_date,
        total_amount: cancelled.total_amount,
      },
    });
  } catch (error) {
    console.error("POST /api/v1/external/bookings/cancel error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
