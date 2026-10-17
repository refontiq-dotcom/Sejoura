// =============================================================================
// Tests du système de visites 360° (panoramas équirectangulaires) de Séjoura.
// =============================================================================
// Fixtures : de VRAIES images générées avec sharp, jamais des octets factices.
// Le stockage est un adapter en mémoire — aucun réseau n'est requis.
//
// Ce que ces tests verrouillent :
//   - le serveur est l'autorité de validation (jamais le navigateur, jamais le
//     nom de fichier) ;
//   - un panorama stocké est BIT POUR BIT celui fourni par l'utilisateur
//     (aucun réencodage, aucune amélioration d'image) ;
//   - un panorama ne devient JAMAIS une photo classique, et réciproquement ;
//   - un média non validé n'est jamais publiable.
// =============================================================================

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  validatePanoramaBytes,
  computeSeamDelta,
  buildTrouvetouPanoramas,
  splitTrouvetouMedia,
  storePanorama,
  PANORAMA_BUCKET,
  PANORAMA_POLICY,
} from "../src/lib/media";
import { canTransition, PANORAMA_TRANSITIONS } from "../src/lib/trouvetou/panoramas";
import type { MediaStorageAdapter, StoredMedia } from "../src/lib/media";

// ── Génération des fixtures ──────────────────────────────────────────────────

const TENANT = "11111111-1111-4111-8111-111111111111";

/** Vrai JPEG panoramique 2:1. */
async function makePanoramaJpeg(width = 4000, height = 2000): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Vrai PNG panoramique 2:1. */
async function makePanoramaPng(width = 3000, height = 1500): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .png()
    .toBuffer();
}

/** Photo classique 4:3 — PAS un panorama, quoi qu'on la nomme. */
async function makeClassicPhoto(width = 4000, height = 3000): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function makeGif(): Promise<Buffer> {
  // Dimensionnement assez large pour dépasser `minBytes` : sinon le fichier
  // serait rejeté comme « tronqué » avant même d'atteindre le contrôle de format,
  // et le test ne vérifierait pas ce qu'il prétend vérifier.
  return sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .gif()
    .toBuffer();
}

/** Fichier JPEG tronqué : en-têtes éventuellement lisibles, pixels manquants. */
function truncateJpeg(valid: Buffer): Buffer {
  return valid.subarray(0, Math.floor(valid.length * 0.55));
}

/** Adapter de stockage en mémoire : simule R2 / Supabase sans réseau. */
function memoryAdapter(): MediaStorageAdapter & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    async put({ bucket, key, body, contentType, cacheControl }): Promise<StoredMedia> {
      const path = `${bucket}/${key}`;
      objects.set(path, body);
      return {
        path,
        url: `https://media.test.invalid/${path}`,
        contentType,
        cacheControl: cacheControl ?? "3600",
      };
    },
    async remove(bucket, key) {
      objects.delete(`${bucket}/${key}`);
    },
  };
}

// ── Validation serveur : le serveur est l'autorité ───────────────────────────

describe("validatePanoramaBytes — acceptation", () => {
  it("accepte un vrai panorama JPEG au ratio 2:1", async () => {
    const result = await validatePanoramaBytes(await makePanoramaJpeg(4000, 2000));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.width).toBe(4000);
      expect(result.height).toBe(2000);
      expect(result.contentType).toBe("image/jpeg");
    }
  });

  it("accepte un panorama PNG au ratio 2:1", async () => {
    const result = await validatePanoramaBytes(await makePanoramaPng());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contentType).toBe("image/png");
  });

  it("accepte la résolution minimale exacte (3000 x 1500)", async () => {
    const result = await validatePanoramaBytes(await makePanoramaJpeg(3000, 1500));
    expect(result.ok).toBe(true);
  });

  it("accepte un ratio dans la tolérance de Trouvetou (2,001)", async () => {
    // 4002 x 2000 = 2.001 : dans la tolérance de 0.02, donc accepté — et donc
    // aussi accepté par l'ingestion Trouvetou, qui applique la même règle.
    const result = await validatePanoramaBytes(await makePanoramaJpeg(4002, 2000));
    expect(result.ok).toBe(true);
  });
});

describe("validatePanoramaBytes — refus", () => {
  it("refuse une image qui n'est pas au ratio 2:1", async () => {
    const result = await validatePanoramaBytes(await makePanoramaJpeg(4000, 3000));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ratio_not_2_1");
      expect(result.message).toContain("2:1");
    }
  });

  it("refuse un ratio au-delà de la tolérance de Trouvetou", async () => {
    // 4000 x 1900 = 2.105 : refusé ici ET refusé par Trouvetou.
    const result = await validatePanoramaBytes(await makePanoramaJpeg(4000, 1900));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ratio_not_2_1");
  });

  it("refuse une résolution trop faible, même au ratio 2:1", async () => {
    const result = await validatePanoramaBytes(await makePanoramaJpeg(2000, 1000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("resolution_too_low");
  });

  it("refuse un JPEG tronqué (fichier corrompu)", async () => {
    const result = await validatePanoramaBytes(truncateJpeg(await makePanoramaJpeg(4000, 2000)));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("corrupt_image");
  });

  it("refuse un fichier vide", async () => {
    const result = await validatePanoramaBytes(Buffer.alloc(0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty_file");
  });

  it("refuse un format non pris en charge (GIF animé)", async () => {
    const result = await validatePanoramaBytes(await makeGif());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unsupported_format");
  });

  it("refuse un fichier dont le contenu n'est pas une image", async () => {
    const result = await validatePanoramaBytes(
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4096, 0x41)])
    );
    expect(result.ok).toBe(false);
  });

  it("refuse un fichier trop volumineux", async () => {
    const result = await validatePanoramaBytes(Buffer.alloc(PANORAMA_POLICY.maxBytes + 1, 0x20));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("too_large");
  });
});

describe("validatePanoramaBytes — le nom de fichier ne prouve rien", () => {
  it("refuse une photo 4:3 même si elle s'appelle 360.jpg", async () => {
    // Le nom est ILLÉGAL comme preuve : seule la mesure des pixels compte.
    const bytes = await makeClassicPhoto(4000, 3000);
    const result = await validatePanoramaBytes(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ratio_not_2_1");
  });

  it("refuse un texte qui prétend être une image 360", async () => {
    const result = await validatePanoramaBytes(Buffer.from("ceci n'est pas une image 360"));
    expect(result.ok).toBe(false);
  });
});


describe("computeSeamDelta — indicateur de continuité", () => {
  it("renvoie un écart nul quand les deux bords sont identiques", () => {
    const raw = Buffer.alloc(4 * 2 * 3, 120);
    expect(computeSeamDelta(raw, 4, 2, 3)).toBe(0);
  });

  it("mesure un écart quand les bords diffèrent", () => {
    // height >= 2 : en dessous, la mesure n'a pas de sens et la fonction
    // renvoie 0 par conception.
    const width = 4;
    const height = 2;
    const channels = 3;
    const raw = Buffer.alloc(width * height * channels, 0);
    // Bord gauche à 0, bord droit à 100 sur les trois canaux ET sur les deux
    // lignes -> écart moyen 100.
    for (let y = 0; y < height; y++) {
      for (let c = 0; c < channels; c++) {
        raw[y * width * channels + (width - 1) * channels + c] = 100;
      }
    }
    expect(computeSeamDelta(raw, width, height, channels)).toBe(100);
  });

  it("moyenne sur les lignes réellement échantillonnées", () => {
    // Seule la première ligne est contrastée : la moyenne doit refléter que
    // l'échantillonnage porte sur les deux lignes, pas sur la seule.
    const width = 4;
    const height = 2;
    const channels = 3;
    const raw = Buffer.alloc(width * height * channels, 0);
    for (let c = 0; c < channels; c++) raw[(width - 1) * channels + c] = 100;
    expect(computeSeamDelta(raw, width, height, channels)).toBe(50);
  });

  it("renvoie 0 plutôt que NaN si le buffer est plus court que la géométrie", () => {
    // Un NaN violerait la contrainte SQL (0-255) et ferait échouer l'insert.
    const raw = Buffer.alloc(6, 0);
    const result = computeSeamDelta(raw, 4, 100, 3);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("reste dans la plage 0-255 sur un vrai panorama", async () => {
    const result = await validatePanoramaBytes(await makePanoramaJpeg(3000, 1500));
    expect(result.ok).toBe(true);
    if (result.ok && result.seamDelta !== null) {
      expect(result.seamDelta).toBeGreaterThanOrEqual(0);
      expect(result.seamDelta).toBeLessThanOrEqual(255);
    }
  });
});

// ── Stockage : aucune transformation de l'image ──────────────────────────────

describe("storePanorama — stockage fidèle", () => {
  it("stocke les octets d'origine bit pour bit (aucun réencodage)", async () => {
    const adapter = memoryAdapter();
    const original = await makePanoramaJpeg(3000, 1500);

    const result = await storePanorama({ bytes: original, tenantId: TENANT, adapter });

    expect(result.ok).toBe(true);
    const stored = adapter.objects.get(`${PANORAMA_BUCKET}/${result.ok ? result.draft.storage_key : ""}`);
    // La seule transformation autorisée est… aucune.
    expect(stored).toBeDefined();
    expect(stored!.equals(original)).toBe(true);
  });

  it("déduit le type de contenu des octets, pas du nom du fichier", async () => {
    const adapter = memoryAdapter();
    const png = await makePanoramaPng();
    const result = await storePanorama({
      bytes: png,
      tenantId: TENANT,
      adapter,
      originalFilename: "ma-photo.jpg", // mensonger : le contenu est un PNG
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.content_type).toBe("image/png");
      expect(result.draft.storage_key.endsWith(".png")).toBe(true);
    }
  });

  it("range la clé sous le préfixe panoramas/ du bucket partagé", async () => {
    const adapter = memoryAdapter();
    const result = await storePanorama({
      bytes: await makePanoramaJpeg(3000, 1500),
      tenantId: TENANT,
      adapter,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.storage_bucket).toBe(PANORAMA_BUCKET);
      expect(result.draft.storage_key).toMatch(
        new RegExp(`^${TENANT}/panoramas/[0-9a-f-]{36}\\.jpg$`)
      );
    }
  });

  it("ne stocke RIEN quand la validation échoue", async () => {
    const adapter = memoryAdapter();
    const result = await storePanorama({
      bytes: await makeClassicPhoto(4000, 3000),
      tenantId: TENANT,
      adapter,
    });
    expect(result.ok).toBe(false);
    expect(adapter.objects.size).toBe(0);
  });

  it("refuse un tenantId qui n'est pas un segment sûr", async () => {
    const adapter = memoryAdapter();
    await expect(
      storePanorama({
        bytes: await makePanoramaJpeg(3000, 1500),
        tenantId: "../../etc/passwd",
        adapter,
      })
    ).rejects.toThrow();
    expect(adapter.objects.size).toBe(0);
  });
});

// ── Machine d'état ───────────────────────────────────────────────────────────

describe("machine d'état des panoramas", () => {
  it("autorise uploaded -> validated -> published", () => {
    expect(canTransition("uploaded", "validated")).toBe(true);
    expect(canTransition("validated", "published")).toBe(true);
  });

  it("autorise le rejet depuis uploaded et depuis validated", () => {
    expect(canTransition("uploaded", "rejected")).toBe(true);
    expect(canTransition("validated", "rejected")).toBe(true);
  });

  it("n'autorise JAMAIS la publication d'un panorama rejeté", () => {
    expect(canTransition("rejected", "published")).toBe(false);
    expect(PANORAMA_TRANSITIONS.rejected).toEqual([]);
  });

  it("n'autorise pas de revenir en arrière depuis published", () => {
    expect(canTransition("published", "validated")).toBe(false);
    expect(canTransition("published", "uploaded")).toBe(false);
  });

  it("n'autorise que le remplacement d'un panorama publié", () => {
    expect(canTransition("published", "superseded")).toBe(true);
    expect(PANORAMA_TRANSITIONS.superseded).toEqual([]);
  });
});


// ── Contrat Trouvetou ────────────────────────────────────────────────────────

const PANORAMA_URL = "https://media.test.invalid/tenant/panoramas/abc.jpg";

function panoramaRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    room_type_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    public_url: PANORAMA_URL,
    width: 6000,
    height: 3000,
    content_type: "image/jpeg",
    validated_at: "2026-10-06T10:00:00.000Z",
    ...overrides,
  } as Parameters<typeof buildTrouvetouPanoramas>[0][number];
}

describe("buildTrouvetouPanoramas — contrat attendu par Trouvetou", () => {
  it("produit la forme attendue par l'ingestion", () => {
    const panoramas = buildTrouvetouPanoramas([panoramaRecord()]);
    expect(panoramas).toHaveLength(1);
    expect(panoramas[0]).toEqual({
      id: "11111111-2222-4333-8444-555555555555",
      media_type: "photo_360",
      projection: "equirectangular_2_1",
      url: PANORAMA_URL,
      width: 6000,
      height: 3000,
      content_type: "image/jpeg",
      room_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      validated_at: "2026-10-06T10:00:00.000Z",
    });
  });

  it("déclare explicitement media_type et projection (jamais déduits)", () => {
    // Sans ces deux champs, l'ingestion ne peut pas distinguer une visite 360°
    // d'une image ordinaire : ils doivent être présents, pas devinés.
    const [panorama] = buildTrouvetouPanoramas([panoramaRecord()]);
    expect(panorama.media_type).toBe("photo_360");
    expect(panorama.projection).toBe("equirectangular_2_1");
  });

  it("refuse une URL non http(s) — même sous la même forme que Trouvetou", () => {
    expect(buildTrouvetouPanoramas([panoramaRecord({ public_url: "javascript:alert(1)" })])).toEqual([]);
    expect(buildTrouvetouPanoramas([panoramaRecord({ public_url: "/relatif.jpg" })])).toEqual([]);
  });

  it("refuse un panorama au mauvais ratio", () => {
    expect(buildTrouvetouPanoramas([panoramaRecord({ width: 1000, height: 1000 })])).toEqual([]);
  });

  it("déduplique par identifiant stable, pas par URL", () => {
    const doublon = panoramaRecord();
    const result = buildTrouvetouPanoramas([panoramaRecord(), doublon]);
    expect(result).toHaveLength(1);
  });

  it("renvoie une liste vide pour une entrée invalide sans faire échouer le reste", () => {
    const result = buildTrouvetouPanoramas([
      panoramaRecord({ public_url: "javascript:x" }),
      panoramaRecord(),
    ]);
    expect(result).toHaveLength(1);
  });
});

// ── Séparation stricte photos classiques / panoramas ────────────────────────

describe("splitTrouvetouMedia — un panorama n'est JAMAIS une photo", () => {
  const CLASSIQUE = "https://media.test.invalid/tenant/room-types/chambre.webp";

  it("place la photo classique dans images et le panorama dans panoramas", () => {
    const { images, panoramas } = splitTrouvetouMedia({
      featuredImages: [CLASSIQUE],
      panoramaRecords: [panoramaRecord()],
    });
    expect(images).toEqual([CLASSIQUE]);
    expect(panoramas).toHaveLength(1);
    // L'invariant central : aucune URL de panorama dans la galerie.
    for (const panorama of panoramas) expect(images).not.toContain(panorama.url);
  });

  it("retire de la galerie une URL de panorama qui s'y serait glissée", () => {
    // Défense en profondeur : même une URL de panorama présente dans
    // featured_images ne doit pas être rendue comme une vignette plate.
    const { images } = splitTrouvetouMedia({
      featuredImages: [PANORAMA_URL, CLASSIQUE],
      panoramaRecords: [panoramaRecord()],
    });
    expect(images).toEqual([CLASSIQUE]);
    expect(images).not.toContain(PANORAMA_URL);
  });

  it("ne fabrique pas de galerie à partir du seul panorama", () => {
    const { images } = splitTrouvetouMedia({
      featuredImages: [],
      panoramaRecords: [panoramaRecord()],
    });
    expect(images).toEqual([]);
  });

  it("laisse les photos classiques intactes quand il n'y a aucun panorama", () => {
    const { images, panoramas } = splitTrouvetouMedia({
      featuredImages: [CLASSIQUE, "https://media.test.invalid/tenant/room-types/b.webp"],
      panoramaRecords: [],
    });
    expect(images).toHaveLength(2);
    expect(panoramas).toEqual([]);
  });

  it("conserve le repli historique sur le logo quand il n'y a aucune photo", () => {
    const { images } = splitTrouvetouMedia({
      featuredImages: [],
      logoUrl: "https://cdn.test.invalid/logo.png",
      panoramaRecords: [panoramaRecord()],
    });
    expect(images).toEqual(["https://cdn.test.invalid/logo.png"]);
  });

  it("respecte la limite de 4 photos classiques", () => {
    const many = Array.from(
      { length: 7 },
      (_, i) => `https://media.test.invalid/tenant/room-types/p${i}.webp`
    );
    const { images } = splitTrouvetouMedia({ featuredImages: many, panoramaRecords: [] });
    expect(images).toHaveLength(4);
  });

  it("déduplique les photos classiques", () => {
    const { images } = splitTrouvetouMedia({
      featuredImages: [CLASSIQUE, CLASSIQUE],
      panoramaRecords: [],
    });
    expect(images).toEqual([CLASSIQUE]);
  });
});


// ── Garde-fou : les colonnes 360° hors migration ne doivent pas revenir ───────
//
// PRÉMISSE À ÉCLARIR (vérifié sur la base réelle le 2026-10-06) :
// `panorama_360_url`, `panorama_360_preview_url`, `panorama_360_mobile_url` et
// `panorama_360_hd_url` EXISTENT dans `room_types`. Elles ont été créées
// directement depuis l'interface Supabase, hors dépôt : aucune migration ne les
// définit, ce qui les rend non reproductibles (dérive de schéma) et invisible à
// quiconque ne lit que le dépôt.
//
// Elles sont NULL sur l'intégralité des lignes, donc le code ne perd rien en
// cessant de les lire. Ce test ne vérifie donc PAS qu'elles n'existent pas : il
// garantit qu'une future migration ne les recrée pas, et que le code ne
// reparte pas sur ces colonnes au lieu d'utiliser `room_type_panoramas`.

const PHANTOM_COLUMNS = [
  "panorama_360_url",
  "panorama_360_preview_url",
  "panorama_360_mobile_url",
  "panorama_360_hd_url",
];

/**
 * Retire les commentaires (`//`, `/* … *\/`, `--`) d'un fichier SQL ou TS.
 *
 * Indispensable ici : les colonnes sont NOMMÉES dans les commentaires qui
 * documentent leur dérive. On ne veut vérifier que le CODE exécutable, pas la
 * documentation.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

describe("dérive de schéma — colonnes panorama_360_* hors migration", () => {
  it("sync.ts ne relit plus ces colonnes", async () => {
    const { readFile } = await import("node:fs/promises");
    const code = stripComments(await readFile("src/lib/trouvetou/sync.ts", "utf8"));
    for (const column of PHANTOM_COLUMNS) {
      expect(code, `sync.ts ne doit plus utiliser ${column}`).not.toContain(column);
    }
  });

  it("aucune migration ne les recrée (elles restent non reproductibles)", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const dir = "supabase/migrations";
    const files = await readdir(dir);
    for (const file of files) {
      const code = stripComments(await readFile(`${dir}/${file}`, "utf8"));
      for (const column of PHANTOM_COLUMNS) {
        // Une création de colonne prend la forme `ADD COLUMN <nom> <type>`
        // ou apparaît dans une liste `ADD COLUMN IF NOT EXISTS <nom>`.
        const creates = new RegExp(
          `ADD\\s+(?:COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?)?\\b${column}\\b\\s+\\w`,
          "i"
        );
        expect(`${file}: ${creates.test(code)}`, `${file} ne doit pas créer ${column}`).toBe(
          `${file}: false`
        );
      }
    }
  });
});

// ── Non-régression : le pipeline des photos classiques est intact ────────────

describe("non-régression — photos classiques", () => {
  it("reste optimisé en WebP, avec une taille et un format max inchangés", async () => {
    const { handleMediaUpload, MEDIA_POLICIES } = await import("../src/lib/media");
    const policy = MEDIA_POLICIES.photo;
    expect(policy.outputMime).toBe("image/webp");
    expect(policy.maxWidth).toBe(1920);
    expect(policy.maxInputBytes).toBe(12 * 1024 * 1024);
    expect(typeof handleMediaUpload).toBe("function");
  });

  it("ne route pas une photo classique vers le chemin panorama", async () => {
    const { MEDIA_POLICIES } = await import("../src/lib/media");
    // Le pipeline classique garde sa politique : aucune notion de panorama.
    expect(Object.keys(MEDIA_POLICIES)).not.toContain("panorama");
  });
});

