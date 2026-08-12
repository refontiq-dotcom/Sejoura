import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ──────────────────────────────────────────────────────────────────────────────
// Cache simple en mémoire (TTL 60s) pour le portail public.
// Réduit la charge Supabase sur les pics de consultation. Le cache est
// invalidé naturellement par le TTL ; on peut forcer un rafraîchissement
// avec ?no_cache=1.
// ──────────────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; response: NextResponse }>();

function cacheKey(searchParams: URLSearchParams): string {
  const params = new URLSearchParams(searchParams);
  params.delete("no_cache");
  return params.toString();
}

function getCached(key: string): NextResponse | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.response;
}

function setCached(key: string, response: NextResponse): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, response });
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/external/trouvetou/listings
// API publique Trouvetou — retourne les fiches publiées triées par boost_priority
// Tri : priorité 2 (Permanent/Entreprise) → 1 (Express/Essentiel) → 0 (Standard)
// Master gate : seules les chambres dont le type a l'interrupteur Trouvetou ON
//              ET au moins une photo remontent (is_listed_on_trouvetou = true).
// Filtres : ?city=...&check_in=...&check_out=...&amenities=wifi,climatisation
// ──────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city     = searchParams.get("city");
    const checkIn  = searchParams.get("check_in");
    const checkOut = searchParams.get("check_out");
    const amenitiesParam = searchParams.get("amenities");
    const requestedAmenities = amenitiesParam
      ? amenitiesParam.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean)
      : [];

    const skipCache = searchParams.get("no_cache") === "1";
    if (!skipCache) {
      const cached = getCached(cacheKey(searchParams));
      if (cached) return cached;
    }

    const admin = createAdminClient();

    // 1. Récupérer les trouvetou_listings publiés avec tous les champs boost
    const query = admin
      .from("trouvetou_listings")
      .select(`
        id,
        unit_id,
        establishment_id,
        is_published,
        public_title,
        public_description,
        featured_images,
        amenities_badges,
        direct_whatsapp,
        views_count,
        whatsapp_clicks_count,
        updated_at,
        rooms (
          id,
          room_number,
          status,
          room_types (
            id,
            name,
            base_price,
            capacity,
            amenities,
            surface_m2,
            is_listed_on_trouvetou,
            featured_images
          )
        ),
        accommodations (
          id,
          name,
          city,
          country,
          address,
          latitude,
          longitude,
          currency,
          currency_symbol,
          contact_phone,
          is_boosted,
          boost_expires_at,
          is_permanently_boosted,
          boost_express_expires_at
        )
      `)
      .eq("is_published", true);

    const { data: listings, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({ listings: [], total: 0 });
    }

    // 2. Filtres : master gate Trouvetou (interrupteur ON + photo), ville, équipements
    let filteredListings = listings.filter((l) => {
      const room     = Array.isArray(l.rooms) ? l.rooms[0] : l.rooms;
      const roomType = room && (Array.isArray(room.room_types) ? room.room_types[0] : room.room_types);

      // Master gate : interrupteur ON obligatoire
      if (roomType?.is_listed_on_trouvetou !== true) return false;

      const images = roomType?.featured_images && roomType.featured_images.length > 0
        ? roomType.featured_images
        : (l.featured_images || []);
      if (images.length === 0) return false;

      return true;
    });

    if (city) {
      filteredListings = filteredListings.filter((l) => {
        const acc = Array.isArray(l.accommodations) ? l.accommodations[0] : l.accommodations;
        return acc?.city?.toLowerCase() === city.toLowerCase();
      });
    }

    if (requestedAmenities.length > 0) {
      filteredListings = filteredListings.filter((l) => {
        const room     = Array.isArray(l.rooms) ? l.rooms[0] : l.rooms;
        const roomType = room && (Array.isArray(room.room_types) ? room.room_types[0] : room.room_types);
        const roomAmenities = (roomType?.amenities || []).map((a: string) => a.toLowerCase());
        return requestedAmenities.every((a) => roomAmenities.includes(a));
      });
    }

    // 3. Disponibilité en temps réel
    const roomIds = filteredListings.map((l) => l.unit_id);
    let activeBookings: { room_id: string; check_in_date: string; check_out_date: string; status: string }[] = [];

    if (roomIds.length > 0) {
      let bookingQuery = admin
        .from("bookings")
        .select("room_id, check_in_date, check_out_date, status")
        .in("room_id", roomIds)
        .in("status", ["confirmed", "checked_in"]);

      if (checkIn && checkOut) {
        bookingQuery = bookingQuery
          .lt("check_in_date", checkOut)
          .gt("check_out_date", checkIn);
      }

      const { data: bData } = await bookingQuery;
      if (bData) activeBookings = bData;
    }

    const occupiedRoomSet = new Set(activeBookings.map((b) => b.room_id));

    // 4. Calcul boost_priority — miroir de la vue trouvetou_boost_status
    const now = new Date();

    const results = filteredListings.map((item) => {
      const room     = Array.isArray(item.rooms)          ? item.rooms[0]          : item.rooms;
      const roomType = room && (Array.isArray(room.room_types) ? room.room_types[0] : room.room_types);
      const acc      = Array.isArray(item.accommodations) ? item.accommodations[0] : item.accommodations;

      // ── Logique de boost unifiée (miroir de trouvetou_boost_status) ────────
      const isPermanentlyBoosted = acc?.is_permanently_boosted === true;

      const expressExpiry = acc?.boost_express_expires_at
        ? new Date(acc.boost_express_expires_at)
        : null;
      const isExpressBoostActive = expressExpiry !== null && expressExpiry > now;

      const legacyExpiry = acc?.boost_expires_at ? new Date(acc.boost_expires_at) : null;
      const isLegacyBoosted =
        acc?.is_boosted === true && (legacyExpiry === null || legacyExpiry > now);

      // boost_priority : 2 = Permanent (Entreprise), 1 = Express/Legacy (Essentiel), 0 = Standard
      const boostPriority = isPermanentlyBoosted
        ? 2
        : isExpressBoostActive || isLegacyBoosted
        ? 1
        : 0;

      const isBoostActive = boostPriority > 0;

      // Type de boost (utile côté portail Trouvetou pour afficher le bon badge)
      const boostType: "permanent" | "express" | "none" = isPermanentlyBoosted
        ? "permanent"
        : isExpressBoostActive || isLegacyBoosted
        ? "express"
        : "none";

      // ── Disponibilité ──────────────────────────────────────────────────────
      const isBooked  = occupiedRoomSet.has(item.unit_id) || room?.status === "occupied";
      const isAvailable = !isBooked;

      // Photos : source prioritaire = photos du type de chambre (room_types.featured_images)
      const images = roomType?.featured_images && roomType.featured_images.length > 0
        ? roomType.featured_images
        : (item.featured_images || []);

      return {
        id: item.id,
        public_title:       item.public_title       || roomType?.name || `Logement ${room?.room_number || ""}`,
        public_description: item.public_description || "",
        price_per_night:    roomType?.base_price     || 0,
        currency:           acc?.currency_symbol     || "FCFA",
        status_label:       isAvailable ? "Disponible" : "Non disponible",
        is_available:       isAvailable,
        featured_images:    images,
        amenities_badges:   item.amenities_badges   || roomType?.amenities || [],
        whatsapp:           item.direct_whatsapp    || acc?.contact_phone  || "",
        surface_m2:         roomType?.surface_m2     ?? null,
        establishment: {
          id:            acc?.id,
          name:          acc?.name,
          city:          acc?.city,
          address:       acc?.address,
          latitude:      acc?.latitude,
          longitude:     acc?.longitude,
          is_boosted:    isBoostActive,
          boost_type:    boostType,
          boost_priority: boostPriority,
        },
        unit: {
          id:          room?.id,
          room_number: room?.room_number,
          capacity:    roomType?.capacity || 2,
        },
        updated_at: item.updated_at,
        // Méta boost (pour affichage côté portail)
        _boost_priority: boostPriority,
      };
    });

    // 5. Tri : boost_priority DESC → updated_at DESC (pas de biais par établissement)
    results.sort((a, b) => {
      if (b._boost_priority !== a._boost_priority) {
        return b._boost_priority - a._boost_priority;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    // Nettoyage du champ interne avant réponse
    const cleanedResults = results.map(({ _boost_priority: _, ...rest }) => rest);

    const response = NextResponse.json({ listings: cleanedResults, total: cleanedResults.length });
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

    if (!skipCache) {
      setCached(cacheKey(searchParams), response);
    }

    return response;
  } catch (error) {
    console.error("GET /api/v1/external/trouvetou/listings error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/external/trouvetou/listings
// Incrémente les compteurs view / whatsapp_click (accessible publiquement)
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { listing_id, action } = body;

    if (!listing_id || !action) {
      return NextResponse.json(
        { error: "listing_id et action ('view' ou 'whatsapp_click') sont requis" },
        { status: 400 }
      );
    }

    if (!["view", "whatsapp_click"].includes(action)) {
      return NextResponse.json({ error: "action invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: listing } = await admin
      .from("trouvetou_listings")
      .select("views_count, whatsapp_clicks_count")
      .eq("id", listing_id)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 });
    }

    if (action === "view") {
      await admin
        .from("trouvetou_listings")
        .update({ views_count: (listing.views_count || 0) + 1 })
        .eq("id", listing_id);
    } else if (action === "whatsapp_click") {
      await admin
        .from("trouvetou_listings")
        .update({ whatsapp_clicks_count: (listing.whatsapp_clicks_count || 0) + 1 })
        .eq("id", listing_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/v1/external/trouvetou/listings error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
