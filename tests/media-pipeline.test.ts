// Tests unitaires du pipeline média (src/lib/media).
// Fixtures : vraies images générées avec sharp (JPEG, PNG alpha, WebP, GIF, SVG)
// + fichiers corrompus. Le stockage est un adapter mémoire (aucun réseau).

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  handleMediaUpload,
  MediaError,
  MEDIA_POLICIES,
  humanizeBytes,
  detectImageKind,
  isSafeTenantSegment,
  isMediaFromR2,
} from "../src/lib/media";
import type { MediaStorageAdapter, StoredMedia } from "../src/lib/media";

// ── Génération des fixtures ──────────────────────────────────────────────────

async function makeJpeg(width = 3200, height = 1800): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 140, b: 180 } },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function makePngWithAlpha(width = 800, height = 600): Promise<Buffer> {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <rect width="100%" height="100%" fill="none"/>
       <circle cx="${width / 2}" cy="${height / 2}" r="${height / 3}" fill="#336699" fill-opacity="0.85"/>
     </svg>`
  );
  return sharp(svg).png().toBuffer();
}

async function makeWebp(width = 2400, height = 1200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 60, g: 120, b: 90 } },
  })
    .webp({ quality: 90 })
    .toBuffer();
}

async function makeGif(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 150, channels: 3, background: { r: 200, g: 80, b: 80 } },
  })
    .gif()
    .toBuffer();
}

function makeSvg(): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
       <circle cx="100" cy="100" r="80" fill="#204060"/>
     </svg>`
  );
}

function fileOf(data: Buffer | Uint8Array, name: string, type = "image/jpeg"): File {
  // Le MIME déclaré peut être mensonger : le serveur doit utiliser le contenu
  // réel (magic bytes), jamais ce champ seul.
  return new File([new Uint8Array(data)], name, { type });
}

/** Adapter de stockage en mémoire : simule R2/Supabase sans réseau. */
function memoryAdapter(): MediaStorageAdapter & { objects: Map<string, StoredMedia> } {
  const objects = new Map<string, StoredMedia>();
  return {
    objects,
    async put(params) {
      const stored: StoredMedia = {
        path: `${params.bucket}/${params.key}`,
        url: `https://media.test.invalid/${params.bucket}/${params.key}`,
        contentType: params.contentType,
        cacheControl: params.cacheControl ?? "3600",
      };
      if (!params.upsert && objects.has(stored.path)) {
        throw new Error("Blob already exists"); // comportement R2/Supabase sans upsert
      }
      objects.set(stored.path, stored);
      return stored;
    },
    async remove(bucket, key) {
      objects.delete(`${bucket}/${key}`);
    },
  };
}

// ── 0. Détection de format par magic bytes ───────────────────────────────────

describe("détection de format (magic bytes)", () => {
  it("détecte les formats réels quel que soit le MIME déclaré", async () => {
    expect(detectImageKind(await makeJpeg(64, 64))).toBe("jpeg");
    expect(detectImageKind(await makePngWithAlpha(64, 64))).toBe("png");
    expect(detectImageKind(await makeWebp(64, 64))).toBe("webp");
    expect(detectImageKind(await makeGif())).toBe("gif");
    expect(detectImageKind(makeSvg())).toBe("svg");
  });

  it("signale unknown pour un fichier quelconque", () => {
    expect(detectImageKind(Buffer.from("%PDF-1.7 document"))).toBe("unknown");
    expect(detectImageKind(Buffer.from("texte simple, pas une image"))).toBe("unknown");
  });

  it("détecte un JPEG tronqué comme jpeg (magic) mais échoue au décodage", async () => {
    const jpeg = await makeJpeg(300, 200);
    const truncated = jpeg.subarray(0, Math.floor(jpeg.length / 2));
    const adapter = memoryAdapter();
    await expect(
      handleMediaUpload({ file: fileOf(new Uint8Array(truncated), "tronque.jpg"), kind: "photo", tenantId: "t1", adapter })
    ).rejects.toMatchObject({ code: "invalid_image" });
  });
});

// ── Tests 1 à 12 exigés ──────────────────────────────────────────────────────

describe("les 12 cas d'usage exigés", () => {
  it("T1 — petite photo JPEG : stockée telle quelle (aucun agrandissement)", async () => {
    const adapter = memoryAdapter();
    const jpeg = await makeJpeg(800, 600);
    const result = await handleMediaUpload({
      file: fileOf(jpeg, "petite.jpg"),
      kind: "photo",
      tenantId: "tenant-1",
      adapter,
    });
    expect(result.optimized.transformed).toBe(true);
    expect(result.optimized.width).toBe(800); // pas d'agrandissement
    expect(result.optimized.height).toBe(600);
    expect(result.optimized.contentType).toBe("image/webp");
    expect(result.optimized.bytesOut).toBeLessThan(result.optimized.bytesIn);
    expect(adapter.objects.size).toBe(1);
  });

  it("T2 — photo smartphone haute résolution : réduite à 1920 px, ratio conservé", async () => {
    const jpeg = await makeJpeg(3200, 1800);
    const result = await handleMediaUpload({
      file: fileOf(jpeg, "smartphone.jpg"),
      kind: "photo",
      tenantId: "tenant-1",
      adapter: memoryAdapter(),
    });
    expect(result.optimized.width).toBe(1920);
    expect(result.optimized.height).toBe(1080); // 16/9 conservé
    expect(result.optimized.bytesOut).toBeLessThan(result.optimized.bytesIn);
  });

  it("T3 — PNG avec transparence : le canal alpha survit à la conversion WebP", async () => {
    const png = await makePngWithAlpha();
    const result = await handleMediaUpload({
      file: fileOf(png, "logo.png", "image/png"),
      kind: "logo",
      tenantId: "tenant-1",
      adapter: memoryAdapter(),
    });
    const meta = await sharp(result.optimized.buffer).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(result.optimized.contentType).toBe("image/webp");
  });

  it("T4 — WebP en entrée : optimisé et ressorti en WebP", async () => {
    const webp = await makeWebp();
    const result = await handleMediaUpload({
      file: fileOf(webp, "deja-webp.webp", "image/webp"),
      kind: "photo",
      tenantId: "tenant-1",
      adapter: memoryAdapter(),
    });
    expect(result.optimized.detectedKind).toBe("webp");
    expect(result.optimized.contentType).toBe("image/webp");
    expect(result.optimized.width).toBe(1920); // 2400 → 1920
  });

  it("T5 — fichier trop volumineux : refusé avec un message clair", async () => {
    const tooBig = Buffer.alloc(MEDIA_POLICIES.photo.maxInputBytes + 1);
    const adapter = memoryAdapter();
    await expect(
      handleMediaUpload({
        file: fileOf(tooBig, "énorme.jpg"),
        kind: "photo",
        tenantId: "tenant-1",
        adapter,
      })
    ).rejects.toMatchObject({ code: "too_large" });
    expect(adapter.objects.size).toBe(0);
    expect(humanizeBytes(MEDIA_POLICIES.photo.maxInputBytes)).toBe("12 Mo");
  });

  it("T6 — format non autorisé : refusé (PDF déguisé, image corrompue)", async () => {
    const adapter = memoryAdapter();
    // Un PDF qui se prétend JPEG (assez grand pour passer le plancher de 64 o)
    const fakePdf = Buffer.from(
      "%PDF-1.7\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n" +
        "% padding pour dépasser la taille minimale de contrôle %\n".repeat(4) +
        "trailer\n<</Root 1 0 R>>\n%%EOF\n",
      "utf8"
    );
    await expect(
      handleMediaUpload({
        file: fileOf(fakePdf, "fake.jpg"),
        kind: "photo",
        tenantId: "tenant-1",
        adapter,
      })
    ).rejects.toMatchObject({ code: "unsupported_format" });

    // Un SVG refusé pour les photos (réservé aux logos)
    await expect(
      handleMediaUpload({
        file: fileOf(makeSvg(), "dessin.svg", "image/svg+xml"),
        kind: "photo",
        tenantId: "tenant-1",
        adapter,
      })
    ).rejects.toMatchObject({ code: "unsupported_format" });
    expect(adapter.objects.size).toBe(0);
  });

  it("T7 — nom de fichier avec espaces/accents : jamais dans la clé", async () => {
    const jpeg = await makeJpeg(640, 480);
    const result = await handleMediaUpload({
      file: fileOf(jpeg, "Mon Photo Été 2024 (1) - copie.jpg"),
      kind: "photo",
      tenantId: "tenant-1",
      adapter: memoryAdapter(),
    });
    expect(result.storageKey).toMatch(/^tenant-1\/room-types\/[0-9a-f-]{36}\.webp$/);
    expect(result.storageKey).not.toContain(" ");
    expect(result.storageKey.normalize("NFD").length).toBe(result.storageKey.length);
  });

  it("T8 — deux utilisateurs, même nom de fichier : deux objets distincts", async () => {
    const adapter = memoryAdapter();
    const jpeg = await makeJpeg(640, 480);
    const a = await handleMediaUpload({
      file: fileOf(jpeg, "photo.jpg"),
      kind: "photo",
      tenantId: "tenant-a",
      adapter,
    });
    const b = await handleMediaUpload({
      file: fileOf(jpeg, "photo.jpg"),
      kind: "photo",
      tenantId: "tenant-b",
      adapter,
    });
    expect(a.storageKey).not.toBe(b.storageKey);
    expect(a.storageKey.startsWith("tenant-a/")).toBe(true);
    expect(b.storageKey.startsWith("tenant-b/")).toBe(true);
    expect(adapter.objects.size).toBe(2);
  });

  it("T9 — remplacement d'un logo : même chemin, écrasement du même tenant", async () => {
    const adapter = memoryAdapter();
    const first = await handleMediaUpload({
      file: fileOf(await makeJpeg(400, 400), "logo1.jpg"),
      kind: "logo",
      tenantId: "tenant-1",
      adapter,
    });
    const second = await handleMediaUpload({
      file: fileOf(await makeJpeg(300, 300), "logo2.jpg"),
      kind: "logo",
      tenantId: "tenant-1",
      adapter,
    });
    expect(first.storageKey).toBe(second.storageKey);
    expect(adapter.objects.size).toBe(1); // l'ancien logo du tenant est remplacé
  });

  it("T10 — suppression : l'objet disparaît du stockage", async () => {
    const adapter = memoryAdapter();
    const result = await handleMediaUpload({
      file: fileOf(await makeJpeg(640, 480), "a-supprimer.jpg"),
      kind: "photo",
      tenantId: "tenant-1",
      adapter,
    });
    const [bucket, ...rest] = result.storagePath.split("/");
    await adapter.remove(bucket, rest.join("/"));
    expect(adapter.objects.has(result.storagePath)).toBe(false);
  });

  it("T11 — anciennes images Supabase : reconnues et non affectées par le pipeline", () => {
    const prev = process.env.R2_PUBLIC_BASE_URL;
    process.env.R2_PUBLIC_BASE_URL = "https://media.exemple.com";
    try {
      // URL historique Supabase : hors R2, le système la laisse s'afficher telle quelle.
      expect(
        isMediaFromR2(
          "https://abcdefgh.supabase.co/storage/v1/object/public/room-photos/tenant-1/room-types/ancien-uuid.jpg"
        )
      ).toBe(false);
      // Nouvelle URL R2 (base = R2_PUBLIC_BASE_URL) : reconnue comme média R2.
      expect(isMediaFromR2("https://media.exemple.com/tenant-1/logo.webp")).toBe(true);
      expect(isMediaFromR2("/relative/path.jpg")).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.R2_PUBLIC_BASE_URL;
      else process.env.R2_PUBLIC_BASE_URL = prev;
    }
  });

  it("T12 — nouvelles images R2 : URL publique sur la base R2, clé sûre, cache immuable", async () => {
    const result = await handleMediaUpload({
      file: fileOf(await makeJpeg(640, 480), "nouvelle.jpg"),
      kind: "photo",
      tenantId: "tenant-1",
      adapter: memoryAdapter(),
    });
    expect(result.driver).toBe("r2"); // adapter injecté → driver r2 factice
    expect(result.stored.url.startsWith("https://media.test.invalid/room-photos/")).toBe(true);
    expect(result.stored.cacheControl).toContain("immutable");
    expect(result.optimized.extension).toBe("webp");
  });
});

// ── SVG et GIF : passthrough selon la politique ──────────────────────────────

describe("passthrough SVG / GIF", () => {
  it("SVG accepté pour un logo, conservé tel quel", async () => {
    const adapter = memoryAdapter();
    const result = await handleMediaUpload({
      file: new File([new Uint8Array(makeSvg())], "logo.svg", { type: "image/svg+xml" }),
      kind: "logo",
      tenantId: "tenant-1",
      adapter,
    });
    expect(result.optimized.transformed).toBe(false);
    expect(result.optimized.contentType).toBe("image/svg+xml");
    expect(result.storageKey.endsWith("logo.svg")).toBe(true);
  });

  it("GIF animé accepté pour les captures d'écran, conservé tel quel", async () => {
    const result = await handleMediaUpload({
      file: new File([new Uint8Array(await makeGif())], "capture.gif", { type: "image/gif" }),
      kind: "screenshot",
      adapter: memoryAdapter(),
    });
    expect(result.optimized.transformed).toBe(false);
    expect(result.optimized.contentType).toBe("image/gif");
    expect(result.storageKey).toMatch(/^uploads\/[0-9a-f-]{36}\.gif$/);
  });

  it("GIF refusé pour les photos de chambre (pas de GIF dans les galeries)", async () => {
    await expect(
      handleMediaUpload({
        file: new File([new Uint8Array(await makeGif())], "photo.gif", { type: "image/gif" }),
        kind: "photo",
        tenantId: "tenant-1",
        adapter: memoryAdapter(),
      })
    ).rejects.toMatchObject({ code: "unsupported_format" });
  });
});

// ── Sécurité des clés ────────────────────────────────────────────────────────

describe("sécurité des clés de stockage", () => {
  it("les segments de tenant dangereux sont rejetés", async () => {
    expect(isSafeTenantSegment("tenant-1")).toBe(true);
    expect(isSafeTenantSegment("8f2b0c1d")).toBe(true);
    expect(isSafeTenantSegment("../evil")).toBe(false);
    expect(isSafeTenantSegment("tenant/1")).toBe(false);
    expect(isSafeTenantSegment("tenant 1")).toBe(false);
    expect(isSafeTenantSegment("")).toBe(false);
    const adapter = memoryAdapter();
    await expect(
      handleMediaUpload({
        file: fileOf(await makeJpeg(64, 64), "x.jpg"),
        kind: "photo",
        tenantId: "../evil",
        adapter,
      })
    ).rejects.toBeInstanceOf(MediaError);
  });
});
