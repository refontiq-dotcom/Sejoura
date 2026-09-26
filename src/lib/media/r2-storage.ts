// Service de stockage média vers Cloudflare R2 (API S3).
// Réutilise le client et les helpers de src/lib/storage/r2.ts.
// Cache long possible : les clés contiennent un UUID (contenu immuable),
// sauf le logo qui est écrasé à chemin fixe (TTL court sur celui-là).

import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, isR2Configured } from "@/lib/storage/r2";
import { createSupabaseMediaStorage } from "./supabase-storage";
import { MediaError } from "./errors";
import type { MediaStorageAdapter, StoragePutParams, StoredMedia } from "./supabase-storage";

/** Cache-Control par défaut pour les objets R2 à clé UUID (immuables). */
export const R2_IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function isR2MediaConfigured(): boolean {
  return isR2Configured();
}

export function createR2MediaStorage(): MediaStorageAdapter {
  return {
    async put(params: StoragePutParams): Promise<StoredMedia> {
      const client = getR2Client();
      const bucket = process.env.R2_BUCKET_MEDIA;
      const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

      if (!client || !bucket || !publicBaseUrl) {
        throw new MediaError("storage_error", "R2 non configuré");
      }

      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: params.key,
            Body: params.body,
            ContentType: params.contentType,
            CacheControl: params.cacheControl ?? R2_IMMUTABLE_CACHE_CONTROL,
          })
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : undefined;
        throw new MediaError("storage_error", detail);
      }

      const base = publicBaseUrl.trim().replace(/\/+$/, "");
      return {
        path: params.key,
        url: `${base}/${params.key.replace(/^\/+/, "")}`,
        contentType: params.contentType,
        cacheControl: params.cacheControl ?? R2_IMMUTABLE_CACHE_CONTROL,
      };
    },

    async remove(bucket, key): Promise<void> {
      const client = getR2Client();
      const r2Bucket = process.env.R2_BUCKET_MEDIA;
      if (!client || !r2Bucket || bucket !== r2Bucket) return;
      try {
        await client.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }));
      } catch {
        // La suppression d'un objet orphelin ne doit jamais faire échouer une
        // requête utilisateur : journalisée côté appelant si nécessaire.
      }
    },
  };
}

/**
 * Choisit le driver de stockage média :
 *   - "r2"       si les variables R2 sont toutes présentes ;
 *   - "supabase" sinon (fallback historique, réversible à tout moment).
 * MEDIA_STORAGE_DRIVER="supabase" force le driver historique explicitement.
 */
export function resolveMediaStorage(): { driver: "r2" | "supabase"; adapter: MediaStorageAdapter } {
  const forced = (process.env.MEDIA_STORAGE_DRIVER || "").trim().toLowerCase();
  if (forced === "supabase") {
    return { driver: "supabase", adapter: createSupabaseMediaStorage() };
  }
  if (isR2MediaConfigured()) {
    return { driver: "r2", adapter: createR2MediaStorage() };
  }
  return { driver: "supabase", adapter: createSupabaseMediaStorage() };
}
