import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/external/bookings
// Liste les 50 dernières réservations du tenant (authentification par clé API).
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

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", keyData.tenant_id)
      .maybeSingle();

    if (!subscription || subscription.plan !== "entreprise") {
      return NextResponse.json({ error: "Cette clé API est réservée à la formule Entreprise" }, { status: 403 });
    }

    const { data: bookings } = await admin
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

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/external/bookings
// Crée une réservation depuis un portail externe (ex : Trouvetou).
// Authentification : `x-api-key: <clé>` ou `Authorization: Bearer <clé>`.
//
// Corps attendu :
//   {
//     "room_type_id": "<UUID du type de chambre>",
//     "check_in_date": "YYYY-MM-DD",
//     "check_out_date": "YYYY-MM-DD",
//     "number_of_guests": 2,
//     "special_requests": "..." | null,
//     "guest": { "full_name": "...", "phone": "...", "email": "..." }
//   }
//
// Sélectionne automatiquement une chambre disponible du type sur la période,
// réutilise le client (même téléphone) sinon le crée, puis appelle la fonction
// `create_booking` (anti double-booking, code SJ-YYYY-NNNN). Statut : `confirmed`.
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

    const {
      room_type_id,
      check_in_date,
      check_out_date,
      number_of_guests,
      special_requests,
      guest,
    } = body;

    if (!room_type_id || !check_in_date || !check_out_date) {
      return NextResponse.json(
        { error: "room_type_id, check_in_date et check_out_date sont requis" },
        { status: 400 }
      );
    }
    if (check_in_date >= check_out_date) {
      return NextResponse.json(
        { error: "check_out_date doit être postérieur à check_in_date" },
        { status: 400 }
      );
    }
    if (!guest?.full_name || typeof guest.full_name !== "string" || !guest.full_name.trim()) {
      return NextResponse.json({ error: "guest.full_name est requis" }, { status: 400 });
    }

    const tenantId = keyData.tenant_id;

    // 1. Vérifier que le type de chambre appartient au tenant
    const { data: roomType, error: rtError } = await admin
      .from("room_types")
      .select("id, accommodation_id, base_price")
      .eq("id", room_type_id)
      .maybeSingle();

    if (rtError || !roomType) {
      return NextResponse.json({ error: "Type de chambre introuvable" }, { status: 404 });
    }

    const { data: accCheck } = await admin
      .from("accommodations")
      .select("tenant_id")
      .eq("id", roomType.accommodation_id)
      .maybeSingle();

    if (!accCheck || accCheck.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: "Ce type de chambre ne dépend pas de votre résidence" },
        { status: 403 }
      );
    }

    // 2. Trouver une chambre disponible du type sur la période
    const { data: rooms } = await admin
      .from("rooms")
      .select("id, status")
      .eq("room_type_id", room_type_id)
      .eq("accommodation_id", roomType.accommodation_id);

    const roomIds = (rooms ?? []).map((r) => r.id);
    let availableRoom: { id: string } | null = null;

    if (roomIds.length > 0) {
      const { data: bookings } = await admin
        .from("bookings")
        .select("room_id")
        .in("room_id", roomIds)
        .in("status", ["confirmed", "checked_in"])
        .lt("check_in_date", check_out_date)
        .gt("check_out_date", check_in_date);

      const occupiedRoomIds = new Set((bookings ?? []).map((b) => b.room_id));

      availableRoom =
        (rooms ?? []).find((r) => r.status !== "occupied" && !occupiedRoomIds.has(r.id)) ?? null;
    }

    if (!availableRoom) {
      return NextResponse.json(
        { error: "Aucune chambre disponible de ce type pour les dates demandées", code: "NO_ROOM_AVAILABLE" },
        { status: 409 }
      );
    }

    // 3. Réutiliser le client s'il existe (même téléphone) sinon le créer
    const phone = guest.phone ? String(guest.phone).trim() : null;
    let clientId: string | null = null;

    if (phone) {
      const { data: existingClient } = await admin
        .from("clients")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .maybeSingle();
      if (existingClient) clientId = existingClient.id;
    }

    if (!clientId) {
      const { data: newClient, error: clientErr } = await admin
        .from("clients")
        .insert({
          tenant_id: tenantId,
          full_name: guest.full_name.trim(),
          phone,
          email: guest.email ? String(guest.email).trim() : null,
        })
        .select("id")
        .single();

      if (clientErr) {
        return NextResponse.json(
          { error: "Erreur lors de la création du client" },
          { status: 500 }
        );
      }
      clientId = newClient.id;
    }

    // 4. Résoudre created_by : un utilisateur admin de la résidence (owner)
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

    // 5. Calculs (prix = prix de base du type, pas de négociation côté portail)
    const nights = Math.max(
      1,
      Math.round((new Date(check_out_date).getTime() - new Date(check_in_date).getTime()) / 86_400_000)
    );
    const basePrice = roomType.base_price || 0;
    const totalAmount = basePrice * nights;

    // 6. Créer la réservation (RPC : anti double-booking + code SJ-YYYY-NNNN)
    const { data: booking, error: bookingErr } = await admin.rpc("create_booking", {
      p_tenant_id: tenantId,
      p_accommodation_id: roomType.accommodation_id,
      p_room_id: availableRoom.id,
      p_client_id: clientId,
      p_check_in_date: check_in_date,
      p_check_out_date: check_out_date,
      p_base_price: basePrice,
      p_negotiated_price: basePrice,
      p_nights_count: nights,
      p_total_amount: totalAmount,
      p_number_of_guests: parseInt(String(number_of_guests), 10) || 1,
      p_special_requests: special_requests ? String(special_requests) : null,
      p_created_by: ownerUser.id,
    });

    if (bookingErr) {
      if (bookingErr.message.includes("DOUBLE_BOOKING")) {
        return NextResponse.json(
          { error: "Cette chambre vient d'être réservée pour ces dates", code: "DOUBLE_BOOKING" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Erreur lors de la création de la réservation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        booking_code: booking.booking_code,
        status: booking.status,
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        total_amount: booking.total_amount,
        number_of_guests: booking.number_of_guests,
        room_id: booking.room_id,
        client_id: booking.client_id,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/external/bookings error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
