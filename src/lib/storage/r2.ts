// ──────────────────────────────────────────────────────────────────────────────
// Stockage média — pilote Cloudflare R2 (API S3).
//
// Architecture cible : Supabase = DB + Auth + données métier + factures PDF ;
// Cloudflare R2 = photos / logos / médias ; Séjoura ne stocke que des URLs.
//
// Le pilote est choisi au runtime via MEDIA_STORAGE_DRIVER :
//   - "supabase" (défaut) : comportement historique (Supabase Storage),
//   - "r2"                : upload direct sur le bucket média R2.
//
// Variables d'environnement requises pour le pilote "r2" :
//   - CLOUDFLARE_ACCOUNT_ID
//   - CLOUDFLARE_R2_ACCESS_KEY_ID
//   - CLOUDFLARE_R2_SECRET_ACCESS_KEY
//   - R2_BUCKET_MEDIA          (bucket privé, exposé via un domaine public)
//   - R2_PUBLIC_BASE_URL       (ex. https://media.sejoura.com)
//
// Sans ces variables, le pilote "r2" répond par une erreur explicite au lieu
// de basculer silencieusement sur Supabase (fail-safe).
// ──────────────────────────────────────────────────────────────────────────────

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export type MediaStorageDriver = "supabase" | "r2";

/** Pilote par défaut : Supabase Storage (comportement historique). */
const DEFAULT_DRIVER: MediaStorageDriver = "supabase";

/** Lit le pilote de stockage média demandé (défaut : "supabase"). */
export function getMediaStorageDriver(): MediaStorageDriver {
  const raw = (process.env.MEDIA_STORAGE_DRIVER || "").trim().toLowerCase();
  return raw === "r2" ? "r2" : DEFAULT_DRIVER;
}

/** True si toutes les variables d'environnement R2 sont présentes. */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_MEDIA &&
      process.env.R2_PUBLIC_BASE_URL
  );
}

/** Normalise un type MIME : minuscules, sans paramètres ("image/jpeg; x" → "image/jpeg"). */
export function normalizeMime(mime: string): string {
  return (mime || "").split(";")[0].trim().toLowerCase();
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Extension sûre pour un type MIME connu, sinon la valeur de secours. */
export function extensionFromMime(mime: string, fallback = "jpg"): string {
  return MIME_EXTENSIONS[normalizeMime(mime)] ?? fallback;
}

/**
 * Construit une clé d'objet à partir de segments : segments vides ignorés,
 * slashes de bord supprimés, joints par "/".
 * Ex. joinMediaKey(tenantId, "/room-types/", id) → "{tenantId}/room-types/{id}"
 */
export function joinMediaKey(
  ...parts: Array<string | null | undefined>
): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/** Concatène proprement une base d'URL publique et une clé d'objet. */
export function buildPublicMediaUrl(baseUrl: string, key: string): string {
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  const cleanKey = key.replace(/^\/+/, "");
  return `${cleanBase}/${cleanKey}`;
}

/** URL publique d'un objet média, ou null si R2_PUBLIC_BASE_URL est absente. */
export function publicMediaUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return null;
  return buildPublicMediaUrl(base, key);
}

let cachedClient: S3Client | null = null;

/** Client S3 pointant sur l'endpoint R2 du compte (région "auto"), ou null si non configuré. */
export function getR2Client(): S3Client | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return cachedClient;
}

export type R2UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Envoie un fichier média sur le bucket R2 et retourne son URL publique.
 * N'échoue jamais silencieusement : sans configuration, ou en cas d'erreur
 * d'upload, retourne { ok: false, error } pour que l'appelant réponde 500.
 */
export async function uploadToR2Media(params: {
  key: string;
  file: File;
  cacheControl?: string;
}): Promise<R2UploadResult> {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_MEDIA;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  if (!client || !bucket || !publicBaseUrl) {
    return {
      ok: false,
      error: "Stockage R2 non configuré (variables d'environnement manquantes).",
    };
  }

  try {
    const body = new Uint8Array(await params.file.arrayBuffer());
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        Body: body,
        ContentType: normalizeMime(params.file.type) || "application/octet-stream",
        CacheControl: params.cacheControl ?? "3600",
      })
    );
    return { ok: true, url: buildPublicMediaUrl(publicBaseUrl, params.key) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue lors de l'upload R2.";
    return { ok: false, error: message };
  }
}
