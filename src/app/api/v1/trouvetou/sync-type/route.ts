import { NextResponse } from "next/server";
import { getServerAdmin, getServerUser } from "@/lib/supabase/server-auth";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/trouvetou/sync-type
// Synchronisation robuste fiche publique ↔ type de chambre.
//
// Le cahier des charges impose que l'interrupteur du type de chambre pilote la
// visibilité sur Trouvetou. Cette route centralise la logique côté serveur :
//   - listée  => publication (upsert) des trouvetou_listings pour TOUTES les
//                chambres du type, avec les photos et équipements à jour.
//   - non listée => dépublier les fiches de ce type.
//
// Elle est idempotente (rejouable sans effet de bord) et vérifie que l'appelant
// est bien propriétaire du type de chambre (via la session utilisateur).
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const roomTypeId =
      typeof body?.roomTypeId === "string" ? body.roomTypeId.trim() : "";

    if (!roomTypeId) {
      return NextResponse.json(
        { error: "roomTypeId est requis" },
        { status: 400 }
      );
    }

    const admin = getServerAdmin();

    // ─── 1. Authentification ────────────────────────────────────────────────
    const user = await getServerUser(admin, request);
    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    // ─── 2. Récupérer le type + vérifier la propriété ──────────────────────
    const { data: roomType, error: roomTypeError } = await admin
      .from("room_types")
      .select("id, is_listed_on_trouvetou, featured_images, amenities, accommodation_id")
      .eq("id", roomTypeId)
      .maybeSingle();

    if (roomTypeError || !roomType) {
      return NextResponse.json({ error: "Type de chambre introuvable." }, { status: 404 });
    }

    // Vérifier que l'établissement appartient au tenant de l'appelant
    const { data: accommodation } = await admin
      .from("accommodations")
      .select("tenant_id")
      .eq("id", roomType.accommodation_id)
      .maybeSingle();

    if (!accommodation) {
      return NextResponse.json({ error: "Établissement introuvable." }, { status: 404 });
    }
    if (!user.tenantId || accommodation.tenant_id !== user.tenantId) {
      return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    }

    // ─── 3. Récupérer toutes les chambres du type ───────────────────────────
    const { data: rooms, error: roomsError } = await admin
      .from("rooms")
      .select("id")
      .eq("room_type_id", roomTypeId);

    if (roomsError) {
      return NextResponse.json({ error: roomsError.message }, { status: 500 });
    }

    const isListed = roomType.is_listed_on_trouvetou === true;
    const images = roomType.featured_images || [];
    const badges = roomType.amenities || [];

    let publishedCount = 0;

    // ─── 4. Appliquer la synchronisation type → fiche publique ──────────────
    // L'interrupteur du type pilote la visibilité (is_published). Le contenu
    // personnalisé de la fiche (photos, badges, titre, description, WhatsApp)
    // modifié depuis la page « Vitrine Trouvetou » est préservé : on n'écrase
    // les photos/badges que lors de la CRÉATION d'une fiche (premiers défauts).
    for (const room of rooms || []) {
      if (isListed) {
        const { data: existing } = await admin
          .from("trouvetou_listings")
          .select("id")
          .eq("unit_id", room.id)
          .maybeSingle();

        if (existing) {
          // Fiche déjà personnalisée : on ne touche qu'à la publication.
          const { error: updateError } = await admin
            .from("trouvetou_listings")
            .update({ is_published: true })
            .eq("unit_id", room.id);
          if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }
        } else {
          // Première fiche : on initialise avec les photos/équipements du type.
          const { error: insertError } = await admin
            .from("trouvetou_listings")
            .insert({
              unit_id: room.id,
              establishment_id: roomType.accommodation_id,
              is_published: true,
              featured_images: images,
              amenities_badges: badges,
            });
          if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
          }
        }
        publishedCount++;
      } else {
        const { error: unpublishError } = await admin
          .from("trouvetou_listings")
          .update({ is_published: false })
          .eq("unit_id", room.id);
        if (unpublishError) {
          return NextResponse.json({ error: unpublishError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      success: true,
      roomTypeId,
      is_listed_on_trouvetou: isListed,
      syncedRooms: (rooms || []).length,
      publishedCount,
    });
  } catch (error) {
    console.error("POST /api/v1/trouvetou/sync-type error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
