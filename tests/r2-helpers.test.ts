import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPublicMediaUrl,
  extensionFromMime,
  getMediaStorageDriver,
  isR2Configured,
  joinMediaKey,
  normalizeMime,
  publicMediaUrl,
} from "../src/lib/storage/r2";

// ──────────────────────────────────────────────────────────────────────────────
// Tests unitaires des helpers du pilote média R2 (src/lib/storage/r2.ts).
// Aucun appel réseau : on teste la logique pure (MIME, extension, chemins,
// URLs publiques) et la lecture fail-safe des variables d'environnement.
// ──────────────────────────────────────────────────────────────────────────────

const ENV_KEYS = [
  "MEDIA_STORAGE_DRIVER",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_MEDIA",
  "R2_PUBLIC_BASE_URL",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("normalizeMime", () => {
  it("met en minuscules et retire les paramètres", () => {
    expect(normalizeMime("image/JPEG")).toBe("image/jpeg");
    expect(normalizeMime("image/png; charset=binary")).toBe("image/png");
    expect(normalizeMime("  Image/WebP ")).toBe("image/webp");
  });

  it("gère les valeurs vides", () => {
    expect(normalizeMime("")).toBe("");
    expect(normalizeMime(undefined as unknown as string)).toBe("");
  });
});

describe("extensionFromMime", () => {
  it("mappe les types MIME image vers une extension sûre", () => {
    expect(extensionFromMime("image/png")).toBe("png");
    expect(extensionFromMime("image/jpeg")).toBe("jpg");
    expect(extensionFromMime("IMAGE/JPEG")).toBe("jpg");
    expect(extensionFromMime("image/webp")).toBe("webp");
    expect(extensionFromMime("image/svg+xml")).toBe("svg");
    expect(extensionFromMime("image/gif")).toBe("gif");
    expect(extensionFromMime("image/avif")).toBe("avif");
  });

  it("retourne l'extension de secours pour un type inconnu", () => {
    expect(extensionFromMime("application/pdf", "bin")).toBe("bin");
    expect(extensionFromMime("", "png")).toBe("png");
  });

  it("normalise jpeg → jpg comme les routes d'upload historiques", () => {
    expect(extensionFromMime("image/jpeg", "png")).toBe("jpg");
  });
});

describe("joinMediaKey", () => {
  it("joint les segments avec des slashes", () => {
    expect(joinMediaKey("tenant-1", "room-types", "abc.jpg")).toBe(
      "tenant-1/room-types/abc.jpg"
    );
  });

  it("ignore les segments vides et nettoie les slashes de bord", () => {
    expect(joinMediaKey("tenant-1", "/room-types/", "abc.jpg")).toBe(
      "tenant-1/room-types/abc.jpg"
    );
    expect(joinMediaKey("/uploads/", "abc.png", null, undefined, "")).toBe(
      "uploads/abc.png"
    );
    expect(joinMediaKey("", "   ", null)).toBe("");
  });

  it("reproduit les chemins historiques des 4 flux d'upload", () => {
    const tenantId = "tenant-42";
    expect(joinMediaKey(tenantId, "logo.png")).toBe("tenant-42/logo.png");
    expect(joinMediaKey(tenantId, "room-types", "uuid.jpg")).toBe(
      "tenant-42/room-types/uuid.jpg"
    );
    expect(joinMediaKey(tenantId, "ads", "uuid.webp")).toBe(
      "tenant-42/ads/uuid.webp"
    );
    expect(joinMediaKey("uploads", "uuid.gif")).toBe("uploads/uuid.gif");
  });
});

describe("buildPublicMediaUrl", () => {
  it("concatène base et clé sans double slash", () => {
    expect(buildPublicMediaUrl("https://media.exemple.com", "a/b.jpg")).toBe(
      "https://media.exemple.com/a/b.jpg"
    );
    expect(buildPublicMediaUrl("https://media.exemple.com/", "/a/b.jpg")).toBe(
      "https://media.exemple.com/a/b.jpg"
    );
  });
});

describe("getMediaStorageDriver", () => {
  it("vaut 'supabase' par défaut et pour toute valeur inconnue", () => {
    expect(getMediaStorageDriver()).toBe("supabase");
    process.env.MEDIA_STORAGE_DRIVER = "supabase";
    expect(getMediaStorageDriver()).toBe("supabase");
    process.env.MEDIA_STORAGE_DRIVER = "n'importe quoi";
    expect(getMediaStorageDriver()).toBe("supabase");
  });

  it("vaut 'r2' quand MEDIA_STORAGE_DRIVER=r2 (insensible à la casse)", () => {
    process.env.MEDIA_STORAGE_DRIVER = "r2";
    expect(getMediaStorageDriver()).toBe("r2");
    process.env.MEDIA_STORAGE_DRIVER = "R2";
    expect(getMediaStorageDriver()).toBe("r2");
  });
});

describe("isR2Configured / publicMediaUrl", () => {
  it("est non configuré quand il manque une variable", () => {
    expect(isR2Configured()).toBe(false);
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "key";
    expect(isR2Configured()).toBe(false);
  });

  it("est configuré quand les 5 variables sont présentes", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "key";
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET_MEDIA = "sejoura-media";
    process.env.R2_PUBLIC_BASE_URL = "https://media.exemple.com";
    expect(isR2Configured()).toBe(true);
  });

  it("publicMediaUrl retourne null sans R2_PUBLIC_BASE_URL", () => {
    expect(publicMediaUrl("a/b.jpg")).toBeNull();
  });

  it("publicMediaUrl construit l'URL publique à partir de la base", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://media.exemple.com";
    expect(publicMediaUrl("tenant-42/room-types/abc.jpg")).toBe(
      "https://media.exemple.com/tenant-42/room-types/abc.jpg"
    );
  });
});
