// =============================================================================
// Service serveur des visites 360° — rattachement, machine d'état, remplacement
// =============================================================================
// Utilisé par les routes `/api/v1/trouvetou/room-panoramas`.
//
// RÈGLE DE SÉCURITÉ CENTRALE
//   Toutes les opérations résolvent d'abord le type de chambre ET son
//   établissement, et vérifient que l'établissement appartient au tenant de
//   l'appelant. Aucun identifiant reçu du client n'est utilisé tel quel : un
//   `roomTypeId` appartenant à un autre établissement est traité comme
//   inexistant (404), pas comme une erreur de permission qui confirmerait
//   l'existence de la ressource.
// =============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getMediaStorageForDriver } from "@/lib/media/r2-storage";

export type PanoramaStatus = "uploaded" | "validated" | "published" | "rejected" | "superseded";

export interface PanoramaRow {
  id: string;
  room_type_id: string;
  accommodation_id: string;
  tenant_id: string;
  status: PanoramaStatus;
  storage_driver: "r2" | "supabase";
  storage_bucket: string;
  storage_key: string;
  public_url: string;
  content_type: string;
  byte_size: number;
  width: number;
  height: number;
  seam_delta: number | null;
  validation_error: string | null;
  validated_at: string | null;
  published_at: string | null;
}

/**
 * Transitions autorisées de la machine d'état.
 * Un panorama rejeté ne peut jamais être publié ; un panorama publié ne peut
 * pas revenir en arrière.
 */
export const PANORAMA_TRANSITIONS: Record<PanoramaStatus, PanoramaStatus[]> = {
  uploaded: ["validated", "rejected"],
  validated: ["published", "rejected", "superseded"],
  published: ["superseded"],
  rejected: [],
  superseded: [],
};

export function canTransition(from: PanoramaStatus, to: PanoramaStatus): boolean {
  return PANORAMA_TRANSITIONS[from]?.includes(to) ?? false;
}

// -----------------------------------------------------------------------------
// Résolution du type de chambre et contrôle de propriété
// -----------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminClient>;

export interface OwnedRoomType {
  roomTypeId: string;
  accommodationId: string;
  tenantId: string;
}

/**
 * Résout un `roomTypeId` en vérifiant qu'il appartient bien au tenant fourni.
 *
 * La jointure passe par `accommodations.tenant_id` : c'est la seule source de
 * vérité. Le client ne fournit jamais le tenant ni l'établissement.
 */
export async function resolveOwnedRoomType(
  admin: AdminClient,
  tenantId: string,
  roomTypeId: string
): Promise<OwnedRoomType | null> {
  const { data, error } = await admin
    .from("room_types")
    .select("id, accommodation_id, accommodations!inner(id, tenant_id)")
    .eq("id", roomTypeId)
    .eq("accommodations.tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    accommodation_id: string;
    accommodations: { id: string; tenant_id: string } | null;
  };

  if (!row.accommodations) return null;

  return {
    roomTypeId: row.id,
    accommodationId: row.accommodations.id,
    tenantId,
  };
}

/** Panorama publié d'un type de chambre, ou null. */
export async function getPublishedPanorama(
  admin: AdminClient,
  roomTypeId: string
): Promise<PanoramaRow | null> {
  const { data } = await admin
    .from("room_type_panoramas")
    .select("*")
    .eq("room_type_id", roomTypeId)
    .eq("status", "published")
    .maybeSingle();
  return (data as PanoramaRow | null) ?? null;
}

/** Panorama appartenant à ce tenant, ou null s'il appartient à un autre. */
export async function getOwnedPanorama(
  admin: AdminClient,
  tenantId: string,
  panoramaId: string
): Promise<PanoramaRow | null> {
  const { data } = await admin
    .from("room_type_panoramas")
    .select("*")
    .eq("id", panoramaId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as PanoramaRow | null) ?? null;
}

/**
 * Supprime l'objet stocké d'un panorama.
 *
 * Best-effort : la ligne en base fait foi, un objet orphelin ne doit jamais
 * faire échouer une action utilisateur. Le retrait du fichier est toujours
 * APPELÉ APRÈS le changement de statut en base, jamais avant — c'est ce qui
 * garantit qu'une erreur réseau ne puisse pas laisser une annonce sans image.
 *
 * L'adapter est choisi d'après le driver ENREGISTRÉ sur la ligne, pas d'après la
 * configuration courante : si R2 a été activé entre l'upload et la suppression,
 * résoudre le driver à ce moment viserait le mauvais backend et l'ancien
 * panorama resterait stocké indéfiniment.
 */
export async function removePanoramaObject(
  row: Pick<PanoramaRow, "storage_driver" | "storage_bucket" | "storage_key">
): Promise<void> {
  try {
    await getMediaStorageForDriver(row.storage_driver).remove(
      row.storage_bucket,
      row.storage_key
    );
  } catch {
    // Objet orphelin : la ligne a déjà été supprimée, rien à faire de plus.
  }
}

// -----------------------------------------------------------------------------
// Publication
// -----------------------------------------------------------------------------

export type PublishResult =
  | { ok: true; panorama: PanoramaRow; superseded: PanoramaRow | null }
  | { ok: false; code: "not_found" | "not_validated" | "storage"; message: string };

/**
 * Publie un panorama validé sans jamais laisser le type de chambre sans visite.
 *
 * Séquence (un index unique partiel garantit au plus un panorama publié par
 * type de chambre) :
 *   1. l'ancien passe `published` -> `superseded` ;
 *   2. le nouveau passe `validated` -> `published` ;
 *   3. si l'étape 2 échoue, l'ancien est REMIS en `published` : l'utilisateur
 *      n'est jamais laissé sans visite 360° à cause d'une erreur technique ;
 *   4. le fichier de l'ancien n'est supprimé qu'ensuite, en best-effort.
 *
 * Conséquence : un échec d'upload ne peut pas supprimer la visite actuellement
 * publiée, et un panorama non validé ne peut pas la remplacer.
 */
export async function publishPanorama(
  admin: AdminClient,
  tenantId: string,
  panoramaId: string
): Promise<PublishResult> {
  const target = await getOwnedPanorama(admin, tenantId, panoramaId);
  if (!target) {
    return { ok: false, code: "not_found", message: "Visite 360° introuvable." };
  }
  if (target.status !== "validated") {
    return {
      ok: false,
      code: "not_validated",
      message: "Seule une visite 360° validée peut être publiée.",
    };
  }

  const previous = await getPublishedPanorama(admin, target.room_type_id);

  // 1. Retirer l'ancien de la course.
  if (previous) {
    const { error: supersedeError } = await admin
      .from("room_type_panoramas")
      .update({ status: "superseded", superseded_at: new Date().toISOString() })
      .eq("id", previous.id)
      .eq("status", "published");
    if (supersedeError) {
      return { ok: false, code: "storage", message: supersedeError.message };
    }
  }

  // 2. Publier le nouveau.
  const { data: published, error: publishError } = await admin
    .from("room_type_panoramas")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", target.id)
    .eq("status", "validated")
    .select()
    .maybeSingle();

  if (publishError || !published) {
    // 3. Restauration : l'ancien redevient la visite publiée.
    if (previous) {
      await admin
        .from("room_type_panoramas")
        .update({ status: "published", superseded_at: null })
        .eq("id", previous.id);
    }
    return {
      ok: false,
      code: "storage",
      message: publishError?.message ?? "Publication impossible.",
    };
  }

  // 4. Nettoyage différé du fichier remplacé.
  if (previous) {
    await removePanoramaObject(previous);
  }

  return { ok: true, panorama: published as PanoramaRow, superseded: previous };
}

