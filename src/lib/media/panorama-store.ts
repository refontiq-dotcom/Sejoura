// =============================================================================
// Stockage des visites 360° — validation puis écriture, SANS réencodage
// =============================================================================
// Séjoura ne construit pas de panorama : il stocke EXACTEMENT les octets fournis
// par l'utilisateur.
//
// CONTRASTE AVEC LES PHOTOS CLASSIQUES
//   `handleMediaUpload` (photos, affiches, logos) optimise : sharp redimensionne
//   et réencode en WebP. C'est correct pour une photo de chambre affichée en
//   vignette de 300 px, et deliberation faux pour un panorama :
//     * une image équirectangulaire doit garder ses dimensions exactes, sinon
//       la projection est faussée dans la visionneuse ;
//     * réencoder, c'est modifier l'image de l'utilisateur — ce que la
//       fonctionnalité interdit explicitement.
//   D'où un chemin d'écriture distinct : on valide, puis on stocke les octets
//   d'origine.
// =============================================================================

import { buildPanoramaKey } from "./keys";
import { validatePanoramaBytes, type PanoramaPolicy, type PanoramaValidation } from "./panorama";
import { R2_IMMUTABLE_CACHE_CONTROL, resolveMediaStorage } from "./r2-storage";
import type { MediaStorageAdapter } from "./supabase-storage";

/**
 * Bucket de stockage partagé avec les photos de chambre.
 * Aucun nouveau bucket : les panoramas vivent sous le préfixe de clé
 * `panoramas/`, ce qui suffit à séparer les deux espaces de noms.
 */
export const PANORAMA_BUCKET = "room-photos";

/** Extension de stockage déduite du format RÉEL détecté. */
const EXTENSION_BY_KIND: Record<"jpeg" | "png" | "webp", string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

/** Ligne prête à insérer dans `room_type_panoramas` après un stockage réussi. */
export interface StoredPanoramaDraft {
  media_type: "photo_360";
  projection: "equirectangular_2_1";
  storage_driver: "r2" | "supabase";
  storage_bucket: string;
  storage_key: string;
  public_url: string;
  content_type: string;
  byte_size: number;
  width: number;
  height: number;
  seam_delta: number | null;
  original_filename: string | null;
  status: "validated";
  validation_error: null;
}

export type PanoramaStoreResult =
  | { ok: true; draft: StoredPanoramaDraft }
  | { ok: false; validation: Exclude<PanoramaValidation, { ok: true }> };

export interface StorePanoramaOptions {
  bytes: Buffer;
  /** Préfixe d'isolation — provient TOUJOURS de la session/DB, jamais du client. */
  tenantId: string;
  /** Nom d'origine, conservé pour l'affichage uniquement (jamais pour décider). */
  originalFilename?: string | null;
  /** Injecte un adapter (tests). */
  adapter?: MediaStorageAdapter;
  /** Injecte la politique (tests). */
  policy?: PanoramaPolicy;
}

/**
 * Valide puis stocke un panorama.
 *
 * Ne lève jamais : un fichier refusé est un résultat normal, pas une exception.
 * L'appelant décide s'il inscrit une ligne `rejected` (traçabilité) ou s'il se
 * contente de renvoyer l'erreur.
 */
export async function storePanorama(
  options: StorePanoramaOptions
): Promise<PanoramaStoreResult> {
  const validation = await validatePanoramaBytes(options.bytes, options.policy);
  if (!validation.ok) {
    return { ok: false, validation };
  }

  const driver = options.adapter
    ? "r2"
    : resolveMediaStorage().driver;
  const adapter = options.adapter ?? resolveMediaStorage().adapter;
  const key = buildPanoramaKey(options.tenantId, EXTENSION_BY_KIND[validation.kind]);

  // Un panorama n'est jamais réécrit : la clé contient un UUID, donc le contenu
  // est immuable et peut être servi très longtemps en cache.
  const cacheControl = driver === "r2" ? R2_IMMUTABLE_CACHE_CONTROL : "3600";

  const stored = await adapter.put({
    bucket: PANORAMA_BUCKET,
    key,
    // Octets d'origine, non transformés.
    body: options.bytes,
    // Type issu des magic bytes, jamais du MIME déclaré par le navigateur.
    contentType: validation.contentType,
    cacheControl,
    upsert: false,
  });

  return {
    ok: true,
    draft: {
      media_type: "photo_360",
      projection: "equirectangular_2_1",
      storage_driver: driver,
      storage_bucket: PANORAMA_BUCKET,
      storage_key: key,
      public_url: stored.url,
      content_type: validation.contentType,
      byte_size: validation.byteSize,
      width: validation.width,
      height: validation.height,
      seam_delta: validation.seamDelta,
      original_filename: options.originalFilename ?? null,
      status: "validated",
      validation_error: null,
    },
  };
}
