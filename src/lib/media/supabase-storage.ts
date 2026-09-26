// Service de stockage média vers Supabase Storage (driver historique).
// Même interface que r2-storage.ts : tout bucket utilisé ici est public,
// l'URL publique est déterministe.

import { createAdminClient } from "@/lib/supabase/admin";

export interface StoredMedia {
  /** Chemin de l'objet dans son bucket ("bucket/key" conceptuellement). */
  path: string;
  url: string;
  contentType: string;
  cacheControl: string;
}

export interface StoragePutParams {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
  /** Remplace l'objet existant à la même clé (utilisé pour le logo). */
  upsert?: boolean;
}

export interface MediaStorageAdapter {
  put(params: StoragePutParams): Promise<StoredMedia>;
  remove(bucket: string, key: string): Promise<void>;
}

/** Driver "supabase" : upload via le client admin (service_role). */
export function createSupabaseMediaStorage(): MediaStorageAdapter {
  // Historique : la capture de suggestion créait son bucket à la volée.
  // Conservé pour que le repli Supabase reste fonctionnel à l'identique.
  async function ensureBucket(admin: ReturnType<typeof createAdminClient>, bucket: string) {
    if (bucket !== "feature-screenshots") return;
    try {
      await admin.storage.createBucket(bucket, { public: true });
    } catch {
      // Le bucket existe déjà : on continue
    }
  }

  return {
    async put(params) {
      const admin = createAdminClient();
      await ensureBucket(admin, params.bucket);
      const { error } = await admin.storage.from(params.bucket).upload(params.key, params.body, {
        cacheControl: params.cacheControl ?? "3600",
        upsert: params.upsert ?? false,
        contentType: params.contentType,
      });
      if (error) {
        throw new Error(error.message);
      }
      const { data } = await admin.storage.from(params.bucket).getPublicUrl(params.key);
      if (!data?.publicUrl) {
        throw new Error("URL publique introuvable après upload Supabase.");
      }
      return {
        path: `${params.bucket}/${params.key}`,
        url: data.publicUrl,
        contentType: params.contentType,
        cacheControl: params.cacheControl ?? "3600",
      };
    },

    async remove(bucket, key) {
      const admin = createAdminClient();
      const { error } = await admin.storage.from(bucket).remove([key]);
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
