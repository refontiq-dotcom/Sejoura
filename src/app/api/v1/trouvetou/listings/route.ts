import { NextResponse } from "next/server";
import { getServerAdmin, getServerUser } from "@/lib/supabase/server-auth";
import { isTrouvetouEligible } from "@/lib/trouvetou/eligibility";
import type { Accommodation } from "@/types/database";

// ──────────────────────────────────────────────────────────────────────────────
// GET  /api/v1/trouvetou/listings?tenantId=xxx
// Retourne les données Trouvetou du tenant (plan-aware : ESSENTIEL vs ENTREPRISE).
//
// Modèle aligné sur le portail : UN type de chambre = UNE annonce.
// Le portail expose une fiche par `room_type` (external_id "rt:<id>") ; ce
// endpoint renvoie donc une entrée par type, avec le nombre de chambres du type
// et la disponibilité réelle (chambres non occupées / non couvertes par une
// réservation active). L'ancien modèle « une fiche par chambre physique »
// (trouvetou_listings) est abandonné : rien ne le consomme côté portail.
// ──────────────────────────────────────────────────────────────────────────────

type RoomTypeRow = {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  capacity: number;
  amenities: string[] | null;
  surface_m2: number | null;
  is_listed_on_trouvetou: boolean;
  featured_images: string[] | null;
  accommodation_id: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId est requis" }, { status: 400 });
    }

    const admin = getServerAdmin();

    // Authentification + vérification que le tenant demandé appartient à l'appelant
    const user = await getServerUser(admin, request);
    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (!user.tenantId || user.tenantId !== tenantId) {
      return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    }

    // 1. Récupérer l'abonnement
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const plan            = subscription?.plan || "standard";
    const subActive       = subscription?.status === "active";
    const isEnterprisePlan = plan === "entreprise" || plan === "enterprise";
    const isEssentielPlan  = plan === "essentiel";

    // 2. Récupérer les établissements avec toutes les colonnes boost
    const { data: accommodations, error: accError } = await admin
      .from("accommodations")
      .select(
        "id, name, address, city, country, currency, currency_symbol, contact_phone, is_active, " +
        "is_boosted, boost_expires_at, " +
        "is_permanently_boosted, boost_express_expires_at, boost_express_price_paid"
      )
      .eq("tenant_id", tenantId);

    if (accError) {
      return NextResponse.json({ error: accError.message }, { status: 500 });
    }

    const typedAccommodations = (accommodations ?? []) as unknown as Pick<
      Accommodation,
      | "id" | "name" | "address" | "city" | "country" | "currency" | "currency_symbol"
      | "contact_phone" | "is_active" | "is_boosted" | "boost_expires_at"
      | "is_permanently_boosted" | "boost_express_expires_at" | "boost_express_price_paid"
    >[];
    const accIds = typedAccommodations.map((a) => a.id);
    const emptyResponse = {
      plan,
      isEnterprisePlan,
      isEssentielPlan,
      accommodations: [],
      types: [],
      metrics: { totalViews: 0, totalWhatsappClicks: 0 },
    };

    if (accIds.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    // 3. Calculer les statuts boost (miroir de la vue trouvetou_boost_status)
    const now = new Date();
    const accommodationsWithBoostStatus = typedAccommodations.map((acc) => {
      const isPermanentlyBoosted = acc.is_permanently_boosted === true;
      const expressExpiry        = acc.boost_express_expires_at
        ? new Date(acc.boost_express_expires_at)
        : null;
      const isExpressBoostActive = expressExpiry !== null && expressExpiry > now;
      const legacyExpiry         = acc.boost_expires_at ? new Date(acc.boost_expires_at) : null;
      const isLegacyBoosted      =
        acc.is_boosted === true && (legacyExpiry === null || legacyExpiry > now);
      const isBoostActive        = isPermanentlyBoosted || isExpressBoostActive || isLegacyBoosted;
      const boostPriority        = isPermanentlyBoosted ? 2 : isExpressBoostActive || isLegacyBoosted ? 1 : 0;

      return {
        id: acc.id,
        name: acc.name,
        address: acc.address,
        city: acc.city,
        country: acc.country,
        currency: acc.currency,
        currency_symbol: acc.currency_symbol,
        contact_phone: acc.contact_phone,
        // Legacy
        is_boosted: acc.is_boosted,
        boost_expires_at: acc.boost_expires_at,
        // Nouveaux champs
        is_permanently_boosted: isPermanentlyBoosted,
        is_express_boost_active: isExpressBoostActive,
        boost_express_expires_at: acc.boost_express_expires_at ?? null,
        boost_express_price_paid: acc.boost_express_price_paid ?? 0,
        // Calculés
        is_boost_active: isBoostActive,
        boost_priority: boostPriority,
      };
    });
    const accNameById   = new Map(typedAccommodations.map((a) => [a.id, a.name]));
    const accActiveById = new Map(typedAccommodations.map((a) => [a.id, a.is_active === true]));

    // 4. Récupérer les types de chambre des établissements du tenant
    const { data: roomTypes, error: rtError } = await admin
      .from("room_types")
      .select(
        "id, name, description, base_price, capacity, amenities, surface_m2, " +
        "is_listed_on_trouvetou, featured_images, accommodation_id"
      )
      .in("accommodation_id", accIds);

    if (rtError) {
      return NextResponse.json({ error: rtError.message }, { status: 500 });
    }

    const typedRoomTypes = (roomTypes ?? []) as unknown as RoomTypeRow[];
    const typeIds = typedRoomTypes.map((rt) => rt.id);

    // 5. Disponibilité réelle : une chambre est indisponible si elle est occupée
    //    ou couverte par une réservation active (même logique que la sync).
    const occupiedRoomIds = new Set<string>();
    const roomsByType = new Map<string, { id: string; status: string | null }[]>();

    if (typeIds.length > 0) {
      const { data: rooms } = await admin
        .from("rooms")
        .select("id, status, room_type_id")
        .in("room_type_id", typeIds);

      const allRoomIds: string[] = [];
      for (const room of rooms ?? []) {
        const list = roomsByType.get(room.room_type_id) ?? [];
        list.push({ id: room.id, status: room.status });
        roomsByType.set(room.room_type_id, list);
        if (room.status === "occupied") occupiedRoomIds.add(room.id);
        allRoomIds.push(room.id);
      }

      if (allRoomIds.length > 0) {
        const { data: bookings } = await admin
          .from("bookings")
          .select("room_id")
          .in("room_id", allRoomIds)
          .in("status", ["confirmed", "checked_in"])
          .lt("check_in_date", now.toISOString())
          .gt("check_out_date", now.toISOString());
        for (const booking of bookings ?? []) occupiedRoomIds.add(booking.room_id);
      }
    }

    // 6. Métriques réelles dynamiques — réservations reçues depuis Trouvetou et chiffre d'affaires associé
    let totalTrouvetouBookings = 0;
    let totalTrouvetouRevenue = 0;

    if (allRoomIds.length > 0) {
      const { data: trouvetouBookings } = await admin
        .from("bookings")
        .select("total_amount")
        .in("room_id", allRoomIds)
        .neq("status", "cancelled");

      totalTrouvetouBookings = trouvetouBookings?.length || 0;
      for (const b of trouvetouBookings ?? []) {
        totalTrouvetouRevenue += b.total_amount || 0;
      }
    }

    const typesFormatted = typedRoomTypes
      .map((rt) => {
        const typeRooms = roomsByType.get(rt.id) ?? [];
        const availableRooms = typeRooms.filter((r) => !occupiedRoomIds.has(r.id));
        const featuredImages = Array.isArray(rt.featured_images) ? rt.featured_images : [];

        return {
          id: rt.id,
          name: rt.name,
          description: rt.description,
          accommodation_id: rt.accommodation_id,
          accommodation_name: accNameById.get(rt.accommodation_id) ?? "",
          base_price: rt.base_price,
          capacity: rt.capacity,
          amenities: Array.isArray(rt.amenities) ? rt.amenities : [],
          surface_m2: rt.surface_m2,
          featured_images: featuredImages,
          is_listed_on_trouvetou: rt.is_listed_on_trouvetou === true,
          room_count: typeRooms.length,
          available_room_count: availableRooms.length,
          is_effectively_listed:
            rt.is_listed_on_trouvetou === true &&
            featuredImages.length > 0 &&
            typeRooms.length > 0,
        };
      })
      .filter((t) =>
        isTrouvetouEligible({
          accommodationActive: accActiveById.get(t.accommodation_id) === true,
          subscriptionActive: subActive,
          hasPhoto: t.featured_images.length > 0,
          hasRoom: t.room_count > 0,
        })
      );

    return NextResponse.json({
      plan,
      isEnterprisePlan,
      isEssentielPlan,
      metrics: {
        totalTrouvetouBookings,
        totalTrouvetouRevenue,
      },
      accommodations: accommodationsWithBoostStatus,
      types: typesFormatted,
    });
  } catch (error) {
    console.error("GET /api/v1/trouvetou/listings error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
