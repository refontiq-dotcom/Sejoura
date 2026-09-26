// Point d'entrée du service média Séjoura.
// « Une seule logique fiable plutôt que 5 implémentations différentes. »

import { NextResponse } from "next/server";
import { MediaError } from "./errors";
import { optimizeImage, type OptimizedImage } from "./optimize";
import { MEDIA_POLICIES, humanizeBytes, type MediaKind, type MediaPolicy } from "./policy";
import {
  buildAdKey,
  buildLogoKey,
  buildRoomPhotoKey,
  buildScreenshotKey,
} from "./keys";
import {
  resolveMediaStorage,
  R2_IMMUTABLE_CACHE_CONTROL,
} from "./r2-storage";
import type { MediaStorageAdapter, StoredMedia } from "./supabase-storage";

export { MediaError } from "./errors";
export { detectImageKind } from "./format";
export {
  buildAdKey,
  buildLogoKey,
  buildRoomPhotoKey,
  buildScreenshotKey,
  isSafeTenantSegment,
} from "./keys";
export { MEDIA_POLICIES, humanizeBytes } from "./policy";
export type { MediaKind, MediaPolicy } from "./policy";
export type { StoredMedia, MediaStorageAdapter } from "./supabase-storage";
export { R2_IMMUTABLE_CACHE_CONTROL } from "./r2-storage";
export { isMediaFromR2 } from "./url-classify";
export { resolveMediaStorage, isR2MediaConfigured } from "./r2-storage";
export { optimizeImage } from "./optimize";
export type { OptimizedImage } from "./optimize";

export interface HandledMediaUpload {
  stored: StoredMedia;
  optimized: OptimizedImage;
  /** Bucket/chemin complet de l'objet écrit ("bucket/key"). */
  storagePath: string;
  /** Clé de l'objet (pour suppressions ultérieures). */
  storageKey: string;
  driver: "r2" | "supabase";
}

/** Table de correspondance kind → bucket Supabase historique. */
export const SUPABASE_BUCKETS: Record<MediaKind, string> = {
  photo: "room-photos",
  logo: "logos",
  ad: "room-photos",
  screenshot: "feature-screenshots",
};



/**
 * Traite un fichier téléversé de bout en bout :
 *   1. limite de taille (avant tout décodage — anti DoS) ;
 *   2. optimisation (détection magic bytes, redimensionnement + WebP,
 *      passthrough SVG/GIF, messages clairs) ;
 *   3. génération d'une clé sûre (UUID, isolation tenant) ;
 *   4. upload sur le driver résolu (R2 si configuré, sinon Supabase).
 *
 * Lève uniquement des MediaError dont `.userMessage` est affichable tel quel.
 */
export async function handleMediaUpload(params: {
  file: File;
  kind: MediaKind;
  /** Préfixe d'isolation venant de la session/DB (jamais du client). */
  tenantId?: string;
  /** Force l'écrasement à chemin fixe (logo). */
  upsert?: boolean;
  /** Injecte un adapter (tests). */
  adapter?: MediaStorageAdapter;
  /** Injecte la politique (tests). */
  policy?: MediaPolicy;
}): Promise<HandledMediaUpload> {
  const policy = params.policy ?? MEDIA_POLICIES[params.kind];
  const { file } = params;

  // 1. Taille maximale en entrée (le fichier optimisé sera bien plus léger).
  if (file.size > policy.maxInputBytes) {
    throw new MediaError("too_large", `>${humanizeBytes(policy.maxInputBytes)}`);
  }
  if (file.size < 64) {
    throw new MediaError("invalid_image", "fichier vide ou tronqué");
  }

  // 2. Optimisation : détection réelle du format + transformation.
  const input = Buffer.from(await file.arrayBuffer());
  const optimized = await optimizeImage(input, policy);

  // 3. Clé sûre : UUID côté serveur, nom utilisateur jamais utilisé.
  const extension = optimized.extension;
  let key: string;
  switch (params.kind) {
    case "photo":
      key = buildRoomPhotoKey(params.tenantId ?? "", extension);
      break;
    case "ad":
      key = buildAdKey(params.tenantId ?? "", extension);
      break;
    case "logo":
      key = buildLogoKey(params.tenantId ?? "", extension);
      break;
    case "screenshot":
      key = buildScreenshotKey(extension);
      break;
  }
  const upsert = params.kind === "logo"; // remplacement volontaire du logo du tenant

  // 4. Upload sur le driver résolu (R2 si configuré, sinon Supabase).
  const resolved =
    params.adapter !== undefined
      ? { driver: "r2" as const, adapter: params.adapter }
      : resolveMediaStorage();
  const bucket = SUPABASE_BUCKETS[params.kind];
  const cacheControl = resolved.driver === "r2" && !upsert ? R2_IMMUTABLE_CACHE_CONTROL : "3600";

  let stored: StoredMedia;
  try {
    stored = await resolved.adapter.put({
      bucket,
      key,
      body: optimized.buffer,
      contentType: optimized.contentType,
      cacheControl,
      upsert,
    });
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("storage_error");
  }

  return {
    stored,
    optimized,
    storagePath: `${bucket}/${key}`,
    storageKey: key,
    driver: resolved.driver,
  };
}

/** Construit la réponse JSON normalisée pour une erreur média. */
export function mediaErrorJson(error: unknown): NextResponse {
  if (error instanceof MediaError) {
    const isClientError =
      error.code === "too_large" ||
      error.code === "unsupported_format" ||
      error.code === "invalid_image" ||
      error.code === "too_small";
    return NextResponse.json(
      { error: error.userMessage, code: error.code },
      { status: isClientError ? 400 : 500 }
    );
  }
  return NextResponse.json(
    { error: "Une erreur inattendue est survenue. Réessayez." },
    { status: 500 }
  );
}
