import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/v1/external/availability
// ──────────────────────────────────────────────────────────────────────────────
// API externe (réservée au plan Entreprise). Authentification par clé API :
//   Header `x-api-key: <clé>` ou `Authorization: Bearer <clé>`.
//
// Deux modes :
//   1. Sans paramètre  → liste des établissements actifs du tenant
//      (comportement historique).
//   2. Avec `room_type_id` + `check_in` + `check_out` → disponibilité temps réel
//      du type de chambre sur la plage demandée (toutes les chambres du type
//      qui ne sont ni réservées ni occupées sur la période).
// ──────────────────────────────────────────────────────────────────────────────
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

    const scopes = keyData.scopes || [];
    if (!scopes.includes("availability")) {
      return NextResponse.json(
        { error: "Cette clé API n'a pas le scope 'availability'" },
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

    const { searchParams } = new URL(request.url);
    const roomTypeId = searchParams.get("room_type_id");
    const checkIn    = searchParams.get("check_in");
    const checkOut   = searchParams.get("check_out");

    // ── Mode 2 : disponibilité d'un type de chambre sur une période ──────────
    if (roomTypeId && checkIn && checkOut) {
      if (checkIn >= checkOut) {
        return NextResponse.json(
          { error: "check_out doit être postérieur à check_in" },
          { status: 400 }
        );
      }

      // 1. Chambres du type appartenant au tenant
      const { data: rooms, error: roomsError } = await admin
        .from("rooms")
        .select("id, status")
        .eq("room_type_id", roomTypeId);

      if (roomsError) {
        return NextResponse.json({ error: "Erreur lors de la lecture des chambres" }, { status: 500 });
      }

      const roomIds = (rooms ?? []).map((r) => r.id);

      // 2. Réservations qui chevauchent la période demandée
      const occupiedRoomIds = new Set<string>();

      if (roomIds.length > 0) {
        const { data: bookings } = await admin
          .from("bookings")
          .select("room_id")
          .in("room_id", roomIds)
          .in("status", ["pending_payment", "confirmed", "checked_in"])
          .lt("check_in_date", checkOut)
          .gt("check_out_date", checkIn);

        for (const b of bookings ?? []) occupiedRoomIds.add(b.room_id);
      }

      // 3. Chambres libres (pas de réservation qui chevauche sur les dates)
      const availableRooms = (rooms ?? []).filter(
        (r) => !occupiedRoomIds.has(r.id)
      );

      return NextResponse.json({
        tenantId: keyData.tenant_id,
        room_type_id: roomTypeId,
        check_in: checkIn,
        check_out: checkOut,
        available: availableRooms.length > 0,
        available_rooms: availableRooms.length,
        rooms: availableRooms.map((r) => ({ id: r.id, status: r.status })),
      });
    }

    // ── Mode 1 : liste des établissements actifs (comportement historique) ────
    const { data: accommodations } = await admin
      .from("accommodations")
      .select("id,name,currency")
      .eq("tenant_id", keyData.tenant_id)
      .eq("is_active", true);

    return NextResponse.json({
      tenantId: keyData.tenant_id,
      scopes,
      accommodations: accommodations || [],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
