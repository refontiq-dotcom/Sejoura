import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Accommodation, TrouvetouListing } from "@/types/database";

type RoomWithType = {
  id: string;
  accommodation_id: string;
  room_number: string;
  status: string;
  room_types:
    | { id: string; name: string; base_price: number; capacity: number; amenities: string[] }
    | { id: string; name: string; base_price: number; capacity: number; amenities: string[] }[]
    | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// GET  /api/v1/trouvetou/listings?tenantId=xxx
// Retourne les données Trouvetou du tenant (plan-aware : ESSENTIEL vs ENTREPRISE)
// ──────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId est requis" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Récupérer l'abonnement
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const plan            = subscription?.plan || "standard";
    const isEnterprisePlan = plan === "entreprise" || plan === "enterprise";
    const isEssentielPlan  = plan === "essentiel";

    // 2. Récupérer les établissements avec toutes les colonnes boost
    const { data: accommodations, error: accError } = await admin
      .from("accommodations")
      .select(
        "id, name, address, city, country, currency, currency_symbol, contact_phone, " +
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
      | "contact_phone" | "is_boosted" | "boost_expires_at"
      | "is_permanently_boosted" | "boost_express_expires_at" | "boost_express_price_paid"
    >[];
    const accIds = typedAccommodations.map((a) => a.id);
    if (accIds.length === 0) {
      return NextResponse.json({
        plan,
        isEnterprisePlan,
        isEssentielPlan,
        accommodations: [],
        units: [],
        metrics: { totalViews: 0, totalWhatsappClicks: 0 },
      });
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

    // 4. Récupérer les chambres
    const { data: rooms, error: roomsError } = await admin
      .from("rooms")
      .select(`
        id,
        accommodation_id,
        room_number,
        status,
        room_types (
          id,
          name,
          base_price,
          capacity,
          amenities
        )
      `)
      .in("accommodation_id", accIds);

    if (roomsError) {
      return NextResponse.json({ error: roomsError.message }, { status: 500 });
    }

    // 5. Récupérer les fiches Trouvetou existantes
    const { data: listings, error: listError } = await admin
      .from("trouvetou_listings")
      .select("*")
      .in("establishment_id", accIds);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const typedListings = (listings ?? []) as unknown as TrouvetouListing[];
    const typedRooms    = (rooms ?? []) as unknown as RoomWithType[];
    const listingsByUnit = new Map(typedListings.map((l) => [l.unit_id, l]));

    // 6. Métriques (vues + clics WhatsApp) — masquées pour les plans non-Entreprise
    let totalViews = 0;
    let totalWhatsappClicks = 0;
    if (isEnterprisePlan) {
      typedListings.forEach((l) => {
        totalViews          += l.views_count || 0;
        totalWhatsappClicks += l.whatsapp_clicks_count || 0;
      });
    }

    const unitsFormatted = typedRooms.map((room) => {
      const listing     = listingsByUnit.get(room.id) || null;
      const roomTypeObj = Array.isArray(room.room_types)
        ? room.room_types[0]
        : room.room_types;
      return {
        id: room.id,
        accommodation_id: room.accommodation_id,
        room_number: room.room_number,
        status: room.status,
        room_type_name: roomTypeObj?.name || "Standard",
        base_price: roomTypeObj?.base_price || 0,
        capacity: roomTypeObj?.capacity || 2,
        amenities: roomTypeObj?.amenities || [],
        listing: listing
          ? {
              id: listing.id,
              is_published: listing.is_published,
              public_title: listing.public_title,
              public_description: listing.public_description,
              featured_images: listing.featured_images || [],
              amenities_badges: listing.amenities_badges || [],
              direct_whatsapp: listing.direct_whatsapp,
              // Métriques réservées ENTREPRISE (null pour ESSENTIEL)
              views_count: isEnterprisePlan ? listing.views_count || 0 : null,
              whatsapp_clicks_count: isEnterprisePlan
                ? listing.whatsapp_clicks_count || 0
                : null,
            }
          : null,
      };
    });

    return NextResponse.json({
      plan,
      isEnterprisePlan,
      isEssentielPlan,
      metrics: { totalViews, totalWhatsappClicks },
      accommodations: accommodationsWithBoostStatus,
      units: unitsFormatted,
    });
  } catch (error) {
    console.error("GET /api/v1/trouvetou/listings error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/trouvetou/listings
// Upsert d'une fiche vitrine Trouvetou (accessible ESSENTIEL et ENTREPRISE)
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      unit_id,
      establishment_id,
      is_published,
      public_title,
      public_description,
      featured_images,
      amenities_badges,
      direct_whatsapp,
    } = body;

    if (!unit_id || !establishment_id) {
      return NextResponse.json(
        { error: "unit_id et establishment_id sont requis" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const payload = {
      unit_id,
      establishment_id,
      is_published: typeof is_published === "boolean" ? is_published : false,
      public_title:        public_title   || null,
      public_description:  public_description || null,
      featured_images:     Array.isArray(featured_images)  ? featured_images  : [],
      amenities_badges:    Array.isArray(amenities_badges) ? amenities_badges : [],
      direct_whatsapp:     direct_whatsapp || null,
      updated_at:          new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("trouvetou_listings")
      .upsert(payload, { onConflict: "unit_id" })
      .select()
      .single();

    if (error) {
      console.error("Upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, listing: data });
  } catch (error) {
    console.error("POST /api/v1/trouvetou/listings error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
