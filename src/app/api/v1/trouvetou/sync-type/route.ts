import { NextResponse } from "next/server";
import { getServerAdmin, getServerUser } from "@/lib/supabase/server-auth";
import { syncListingsToTrouvetou } from "@/lib/trouvetou/sync";


// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/trouvetou/sync-type
// Synchronisation robuste fiche publique ↔ type de chambre.
//
// Le cahier des charges impose que l'interrupteur du type de chambre pilote la
// visibilité sur Trouvetou. Cette route centralise la logique côté serveur :
//   - si `is_listed_on_trouvetou` est fourni, elle met à jour l'interrupteur
//     du type (avec contrôle photo obligatoire pour l'activation) ;
//   - elle pousse ensuite l'état réel vers le portail Trouvetou (UPSERT
//     idempotent via external_id "rt:<id>").
//
// Elle est idempotente (rejouable sans effet de bord) et vérifie que l'appelant
// est bien propriétaire du type de chambre (via la session utilisateur).
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const roomTypeId =
      typeof body?.roomTypeId === "string" ? body.roomTypeId.trim() : "";
    const requestedListed =
      typeof body?.is_listed_on_trouvetou === "boolean"
        ? body.is_listed_on_trouvetou
        : null;

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
      .select("id, is_listed_on_trouvetou, featured_images, accommodation_id")
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

    // ─── 3. Basculer l'interrupteur si demandé ──────────────────────────────
    if (requestedListed !== null && requestedListed !== roomType.is_listed_on_trouvetou) {
      if (requestedListed && (roomType.featured_images ?? []).length === 0) {
        return NextResponse.json(
          { error: "Ajoutez au moins une photo au type de chambre pour activer la diffusion sur Trouvetou." },
          { status: 400 }
        );
      }
      const { error: updateError } = await admin
        .from("room_types")
        .update({ is_listed_on_trouvetou: requestedListed })
        .eq("id", roomTypeId);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      roomType.is_listed_on_trouvetou = requestedListed;
    }

    const isListed = roomType.is_listed_on_trouvetou === true;

    // ─── 4. Pousser vers le portail Trouvetou ───────────────────────────────
    // L'interrupteur pilote le push réel vers l'API d'ingestion Trouvetou
    // (TROUVETOU_SYNC_URL). Un échec du push ne doit pas faire échouer la
    // publication locale : on renvoie l'état du push dans la réponse.
    let trouvetouPush: { ok: boolean; sent: number; error?: string } | null = null;
    try {
      trouvetouPush = await syncListingsToTrouvetou();
    } catch (err) {
      trouvetouPush = {
        ok: false,
        sent: 0,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      };
    }

    return NextResponse.json({
      success: true,
      roomTypeId,
      is_listed_on_trouvetou: isListed,
      trouvetouPush,
    });
  } catch (error) {
    console.error("POST /api/v1/trouvetou/sync-type error:", error);
    return NextResponse.json({ error: "Erreur serveur 🖥️" }, { status: 500 });
  }
}
