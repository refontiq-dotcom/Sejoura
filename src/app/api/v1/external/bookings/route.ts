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
// `create_booking` (anti double-booking, code RES-YY-NNNN). Statut : `confirmed`.
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
      payment_method, // 'online' | 'offline'
      payment_provider, // 'wave' | 'orange_money' | 'mtn' | 'moov_africa' | 'pi_spi'
      is_third_party,
      occupant,
    } = body;

    const isThirdParty = Boolean(is_third_party);

    if (isThirdParty && (!occupant?.full_name || typeof occupant.full_name !== "string" || !occupant.full_name.trim())) {
      return NextResponse.json(
        { error: "Pour une réservation tiers, occupant.full_name est requis" },
        { status: 400 }
      );
    }

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
        .in("status", ["pending_payment", "confirmed", "checked_in"])
        .lt("check_in_date", check_out_date)
        .gt("check_out_date", check_in_date);

      const occupiedRoomIds = new Set((bookings ?? []).map((b) => b.room_id));

      availableRoom =
        (rooms ?? []).find((r) => !occupiedRoomIds.has(r.id)) ?? null;
    }

    if (!availableRoom) {
      return NextResponse.json(
        { error: "Aucune chambre disponible de ce type pour les dates demandées", code: "NO_ROOM_AVAILABLE" },
        { status: 409 }
      );
    }

    // 3. Réutiliser le client s'il existe (même téléphone ET même nom) sinon le créer.
    const phone = guest.phone ? String(guest.phone).trim() : null;
    const fullNameNorm = guest.full_name.trim().toLowerCase();
    let clientId: string | null = null;

    if (phone) {
      const { data: existingClients } = await admin
        .from("clients")
        .select("id, full_name")
        .eq("tenant_id", tenantId)
        .eq("phone", phone);

      const matched = (existingClients ?? []).find(
        (c) => c.full_name.trim().toLowerCase() === fullNameNorm
      );
      if (matched) clientId = matched.id;
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

    // 4. Résoudre created_by
    let { data: ownerUser } = await admin
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "admin_residence")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!ownerUser) {
      const { data: fallbackUser } = await admin
        .from("users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      ownerUser = fallbackUser;
    }

    if (!ownerUser) {
      return NextResponse.json(
        { error: "Aucun utilisateur actif trouvé pour cette résidence (impossible d'assigner le créateur de la réservation)" },
        { status: 500 }
      );
    }

    // 5. Calculs
    const nights = Math.max(
      1,
      Math.round((new Date(check_out_date).getTime() - new Date(check_in_date).getTime()) / 86_400_000)
    );
    const basePrice = roomType.base_price || 0;
    const totalAmount = basePrice * nights;

    // Déterminer le statut initial
    const isOnlinePayment = payment_method === "online";
    const initialStatus = isOnlinePayment ? "pending_payment" : "confirmed";

    // 6. Créer la réservation
    const occupantPayload = isThirdParty && occupant ? occupant : {};
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
      p_initial_status: initialStatus,
      p_booking_source: 'external',
      p_is_third_party: isThirdParty,
      p_occupant_full_name: occupantPayload.full_name ? String(occupantPayload.full_name).trim() : null,
      p_occupant_phone: occupantPayload.phone ? String(occupantPayload.phone).trim() : null,
      p_occupant_id_type: occupantPayload.id_type || null,
      p_occupant_id_number: occupantPayload.id_number ? String(occupantPayload.id_number).trim() : null,
      p_occupant_nationality: occupantPayload.nationality ? String(occupantPayload.nationality).trim() : null,
      p_occupant_address: occupantPayload.address ? String(occupantPayload.address).trim() : null,
      p_id_registration_status: 'pending',
    });

    if (bookingErr) {
      if (bookingErr.message.includes("DOUBLE_BOOKING")) {
        return NextResponse.json(
          { error: "Cette chambre vient d'être réservée pour ces dates", code: "DOUBLE_BOOKING" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `Erreur DB lors de la création de la réservation: ${bookingErr.message || JSON.stringify(bookingErr)}` },
        { status: 500 }
      );
    }

    // 7. Si paiement en ligne demandé, on tente d'initialiser le paiement
    if (isOnlinePayment) {
      if (!payment_provider) {
        // Nettoyage en cas d'erreur
        await admin.from("bookings").delete().eq("id", booking.id);
        return NextResponse.json(
          { error: "Le paramètre payment_provider est requis pour un paiement en ligne" },
          { status: 400 }
        );
      }

      const { getPaymentService } = await import("@/lib/payments");
      const service = await getPaymentService(tenantId, payment_provider as any);

      if (!service) {
        await admin.from("bookings").delete().eq("id", booking.id);
        return NextResponse.json(
          { error: `Le mode de paiement ${payment_provider} n'est pas activé ou configuré pour cette résidence` },
          { status: 400 }
        );
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sejoura-lemon.vercel.app";
      const webhookUrl = `${appUrl}/api/v1/webhooks/payments?provider=${payment_provider}`;

      const paymentResult = await service.initiatePayment({
        amount: totalAmount,
        reference: booking.booking_code,
        customerPhone: phone || undefined,
        description: `Réservation Séjoura ${booking.booking_code}`,
        returnUrl: `${appUrl}/stay/booking-success?code=${booking.booking_code}`,
        cancelUrl: `${appUrl}/stay/booking-cancelled?code=${booking.booking_code}`,
        webhookUrl,
      });

      // Si l'initiation du paiement a échoué (hors simulation/stub)
      // Note : les stubs renvoient success: false avec un message, mais pour nos tests et simulations,
      // nous voulons que le script de test puisse fonctionner. Si le service est configuré avec un stub qui échoue
      // explicitement pour cause de configuration manquante, on lève l'erreur.
      if (!paymentResult.success) {
        await admin.from("bookings").delete().eq("id", booking.id);
        return NextResponse.json(
          { error: `L'action a échoué : initier le paiement : ${paymentResult.error}` },
          { status: 502 }
        );
      }

      // Enregistrer la transaction
      const { error: txnErr } = await admin
        .from("online_payment_transactions")
        .insert({
          tenant_id: tenantId,
          booking_id: booking.id,
          provider: payment_provider,
          provider_transaction_id: paymentResult.transactionId || null,
          amount: totalAmount,
          status: "pending",
          checkout_url: paymentResult.checkoutUrl || null,
        });

      if (txnErr) {
        await admin.from("bookings").delete().eq("id", booking.id);
        return NextResponse.json(
          { error: "Erreur lors de la création de la transaction de paiement" },
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
        payment: {
          provider: payment_provider,
          checkout_url: paymentResult.checkoutUrl,
          transaction_id: paymentResult.transactionId,
        }
      }, { status: 201 });
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
