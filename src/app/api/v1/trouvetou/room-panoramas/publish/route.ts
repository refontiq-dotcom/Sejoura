import { NextResponse } from "next/server";
import { getServerAdmin, getServerUser } from "@/lib/supabase/server-auth";
import {
  publishPanorama,
  resolveOwnedRoomType,
} from "@/lib/trouvetou/panoramas";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/trouvetou/room-panoramas/publish
//
// Publie une visite 360° validée vers le type de chambre, et déclenche la
// synchronisation Trouvetou afin que la nouvelle visite apparaisse sans attendre
// le cron.
//
// SÉQUENCE DE REMPLACEMENT (garantie par `publishPanorama`)
//   L'ancien panorama n'est mis hors service qu'APRÈS que le nouveau est
//   effectivement publié, et son fichier n'est supprimé qu'ensuite. Un échec
//   d'upload ne peut donc jamais laisser le type de chambre sans visite 360°.
//
// SÉCURITÉ
//   Le panorama doit appartenir au tenant de la session ET au type de chambre
//   indiqué. Un identifiant d'un autre établissement est traité comme
//   inexistant (404).
// ──────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const admin = getServerAdmin();
    const user = await getServerUser(admin, req);
    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (!user.tenantId) {
      return NextResponse.json(
        { error: "Compte utilisateur introuvable." },
        { status: 404 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const panoramaId = typeof body.panoramaId === "string" ? body.panoramaId.trim() : "";
    const roomTypeId = typeof body.roomTypeId === "string" ? body.roomTypeId.trim() : "";

    if (!panoramaId || !roomTypeId) {
      return NextResponse.json(
        { error: "panoramaId et roomTypeId sont requis." },
        { status: 400 }
      );
    }

    const owned = await resolveOwnedRoomType(admin, user.tenantId, roomTypeId);
    if (!owned) {
      return NextResponse.json({ error: "Type de chambre introuvable." }, { status: 404 });
    }

    const result = await publishPanorama(admin, user.tenantId, panoramaId);
    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }

    // Le panorama publié doit bien être celui du type de chambre demandé :
    // défense supplémentaire contre une incohérence d'identifiants.
    if (result.panorama.room_type_id !== owned.roomTypeId) {
      return NextResponse.json({ error: "Visite 360° introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      id: result.panorama.id,
      status: result.panorama.status,
      url: result.panorama.public_url,
      width: result.panorama.width,
      height: result.panorama.height,
      replaced: result.superseded?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
