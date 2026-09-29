import { NextResponse } from "next/server";
import { getServerAdmin, getServerUser } from "@/lib/supabase/server-auth";
import { storePanorama } from "@/lib/media/panorama-store";
import {
  getOwnedPanorama,
  removePanoramaObject,
  resolveOwnedRoomType,
} from "@/lib/trouvetou/panoramas";

// ──────────────────────────────────────────────────────────────────────────────
// /api/v1/trouvetou/room-panoramas
//
//   POST    upload d'une visite 360°  (multipart: panorama + roomTypeId)
//   GET     état des visites d'un type de chambre (?roomTypeId=…)
//   DELETE  suppression (?id=…&roomTypeId=…)
//
// PRINCIPE
//   La validation précède l'écriture : un fichier invalide n'est jamais stocké
//   ni inserté en base. Rien d'invalide ne peut donc fuiter vers Trouvetou.
//
// SÉCURITÉ
//   Le `roomTypeId` est résolu via `accommodations.tenant_id` : un type de
//   chambre d'un autre établissement répond 404, jamais 403. Le tenant provient
//   toujours de la session, jamais du client.
// ──────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

type Authed = { admin: ReturnType<typeof getServerAdmin>; tenantId: string };
type AuthFailure = { error: NextResponse };

/** Récupère l'utilisateur authentifié + son tenant, ou répond 401/404. */
async function requireTenant(request: Request): Promise<Authed | AuthFailure> {
  const admin = getServerAdmin();
  const user = await getServerUser(admin, request);
  if (!user) {
    return { error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) };
  }
  if (!user.tenantId) {
    return {
      error: NextResponse.json({ error: "Compte utilisateur introuvable." }, { status: 404 }),
    };
  }
  return { admin, tenantId: user.tenantId };
}

export async function POST(req: Request) {
  try {
    const auth = await requireTenant(req);
    if ("error" in auth) return auth.error;
    const { admin, tenantId } = auth;

    const formData = await req.formData();
    const file = formData.get("panorama");
    const roomTypeId =
      typeof formData.get("roomTypeId") === "string"
        ? (formData.get("roomTypeId") as string).trim()
        : "";

    if (!roomTypeId) {
      return NextResponse.json({ error: "roomTypeId est requis." }, { status: 400 });
    }
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
    }

    // Contrôle de propriété AVANT tout traitement coûteux : un utilisateur ne
    // peut pas faire valider un fichier au nom d'un autre établissement.
    const owned = await resolveOwnedRoomType(admin, tenantId, roomTypeId);
    if (!owned) {
      return NextResponse.json({ error: "Type de chambre introuvable." }, { status: 404 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await storePanorama({
      bytes,
      tenantId,
      originalFilename: file.name || null,
    });

    if (!stored.ok) {
      // Rejet : rien n'est stocké, rien n'est inséré.
      return NextResponse.json(
        { error: stored.validation.message, code: stored.validation.code },
        { status: 400 }
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from("room_type_panoramas")
      .insert({
        room_type_id: owned.roomTypeId,
        accommodation_id: owned.accommodationId,
        tenant_id: tenantId,
        media_type: stored.draft.media_type,
        projection: stored.draft.projection,
        storage_driver: stored.draft.storage_driver,
        storage_bucket: stored.draft.storage_bucket,
        storage_key: stored.draft.storage_key,
        public_url: stored.draft.public_url,
        content_type: stored.draft.content_type,
        byte_size: stored.draft.byte_size,
        width: stored.draft.width,
        height: stored.draft.height,
        seam_delta: stored.draft.seam_delta,
        original_filename: stored.draft.original_filename,
        status: "validated",
        validation_error: null,
        validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !inserted) {
      // La ligne n'a pas pu être créée : on retire l'objet pour ne pas laisser
      // de fichier orphelin dans le bucket. Le driver est celui utilisé à
      // l'écriture, pas celui résolu maintenant.
      await removePanoramaObject({
        storage_driver: stored.draft.storage_driver,
        storage_bucket: stored.draft.storage_bucket,
        storage_key: stored.draft.storage_key,
      });
      return NextResponse.json(
        { error: "Enregistrement de la visite 360° impossible." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: inserted.id,
        status: inserted.status,
        url: inserted.public_url,
        width: inserted.width,
        height: inserted.height,
        content_type: inserted.content_type,
        byte_size: inserted.byte_size,
        seam_delta: inserted.seam_delta,
        driver: stored.draft.storage_driver,
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inattendue lors de l'upload.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireTenant(req);
    if ("error" in auth) return auth.error;
    const { admin, tenantId } = auth;

    const roomTypeId = new URL(req.url).searchParams.get("roomTypeId")?.trim() ?? "";
    if (!roomTypeId) {
      return NextResponse.json({ error: "roomTypeId est requis." }, { status: 400 });
    }

    const owned = await resolveOwnedRoomType(admin, tenantId, roomTypeId);
    if (!owned) {
      return NextResponse.json({ error: "Type de chambre introuvable." }, { status: 404 });
    }

    const { data } = await admin
      .from("room_type_panoramas")
      .select(
        "id, status, public_url, width, height, content_type, byte_size, seam_delta, validation_error, created_at, published_at"
      )
      .eq("room_type_id", owned.roomTypeId)
      .order("created_at", { ascending: false });

    return NextResponse.json({ panoramas: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireTenant(req);
    if ("error" in auth) return auth.error;
    const { admin, tenantId } = auth;

    const params = new URL(req.url).searchParams;
    const id = params.get("id")?.trim() ?? "";
    const roomTypeId = params.get("roomTypeId")?.trim() ?? "";

    if (!id || !roomTypeId) {
      return NextResponse.json(
        { error: "id et roomTypeId sont requis." },
        { status: 400 }
      );
    }

    const owned = await resolveOwnedRoomType(admin, tenantId, roomTypeId);
    if (!owned) {
      return NextResponse.json({ error: "Type de chambre introuvable." }, { status: 404 });
    }

    // Le panorama doit appartenir à CE type de chambre ET à CE tenant :
    // un id d'un autre établissement est traité comme inexistant.
    const panorama = await getOwnedPanorama(admin, tenantId, id);
    if (!panorama || panorama.room_type_id !== owned.roomTypeId) {
      return NextResponse.json({ error: "Visite 360° introuvable." }, { status: 404 });
    }

    const { error: deleteError } = await admin
      .from("room_type_panoramas")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // La ligne est supprimée : le fichier peut partir. Best-effort — un objet
    // orphelin ne doit pas faire échouer une action utilisateur.
    await removePanoramaObject(panorama);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

