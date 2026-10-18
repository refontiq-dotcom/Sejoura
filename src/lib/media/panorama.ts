// =============================================================================
// Validation serveur des visites 360° (panoramas équirectangulaires)
// =============================================================================
// Séjoura ne fabrique pas de panorama : il REÇOIT une image équirectangulaire
// déjà produite (caméra 360°, application mobile, logiciel externe) et vérifie
// qu'elle est techniquement exploitable par la visionneuse de Trouvetou.
//
// CE QUE CE MODULE FAIT
//   - lit les BYTES RÉELS du fichier (magic bytes), jamais le MIME déclaré par
//     le navigateur, jamais le nom du fichier ;
//   - décode réellement l'image (sharp) : un fichier tronqué ou corrompu est
//     détecté même si ses en-têtes sont valides ;
//   - vérifie le ratio 2:1 avec EXACTEMENT la tolérance de l'ingestion
//     Trouvetou (`|width/height - 2| <= 0.02`) : rien de ce qui est accepté ici
//     ne peut être refusé là-bas ;
//   - vérifie la résolution minimale (3000 x 1500) ;
//   - calcule un INDICATEUR de continuité de jointure (seam), non bloquant.
//
// CE QUE CE MODULE NE FAIT PAS
//   * Il ne réencode pas, ne redimensionne pas, n'améliore pas l'image. Les
//     pixels stockés sont ceux fournis par l'utilisateur, octet pour octet.
//   * Il ne stitche rien.
//   * Il ne prouve PAS que l'image vient d'une caméra 360°. Une photo plate
//     recadrée en 2:1 passe tous ces contrôles : le ratio 2:1 est une condition
//     nécessaire, pas une preuve. Un message l'indique explicitement à l'UI.
// =============================================================================

import sharp from "sharp";
import { detectImageKind, type DetectedImageKind } from "./format";

// -----------------------------------------------------------------------------
// Politique
// -----------------------------------------------------------------------------

/** Types réellement acceptés pour un panorama. Le GIF est exclu (animation sans
 *  sens en équirectangulaire), le SVG aussi (vectoriel, sans dimensions pixelles
 *  exploitables par la visionneuse). */
const ACCEPTED_KINDS = ["jpeg", "png", "webp"] as const;

export type PanoramaKind = (typeof ACCEPTED_KINDS)[number];

export interface PanoramaPolicy {
  /** Largeur minimale (px). */
  minWidth: number;
  /** Hauteur minimale (px). — 3000 x 1500 = ratio 2:1 exact. */
  minHeight: number;
  /** Taille maximale du fichier entrant (40 Mio). */
  maxBytes: number;
  /** Tolérance sur le ratio : |w/h - 2| <= ratioTolerance. */
  ratioTolerance: number;
  /** Nombre minimal d'octets : en dessous, le fichier est vide ou tronqué. */
  minBytes: number;
}

export const PANORAMA_POLICY: PanoramaPolicy = {
  minWidth: 3000,
  minHeight: 1500,
  maxBytes: 40 * 1024 * 1024,
  ratioTolerance: 0.02,
  minBytes: 1024,
};

/** MIME de sortie par format réellement détecté. */
const MIME_BY_KIND: Record<PanoramaKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// -----------------------------------------------------------------------------
// Résultat de validation
// -----------------------------------------------------------------------------

export type PanoramaRejectionCode =
  | "empty_file"
  | "unsupported_format"
  | "too_large"
  | "corrupt_image"
  | "invalid_dimensions"
  | "ratio_not_2_1"
  | "resolution_too_low";

export interface PanoramaRejected {
  ok: false;
  code: PanoramaRejectionCode;
  /** Message affichable tel quel à l'utilisateur (français). */
  message: string;
}

export interface PanoramaAccepted {
  ok: true;
  /** Format réel déduit des magic bytes. */
  kind: PanoramaKind;
  contentType: string;
  width: number;
  height: number;
  byteSize: number;
  /**
   * Indicateur de continuité de jointure, normalisé 0-255 : écart moyen entre
   * la colonne de droite et la colonne de gauche (l'azimut doit être continu).
   * NON BLOQUANT — c'est un signal de qualité, pas un critère de rejet.
   */
  seamDelta: number | null;
}

export type PanoramaValidation = PanoramaAccepted | PanoramaRejected;

function reject(code: PanoramaRejectionCode, message: string): PanoramaRejected {
  return { ok: false, code, message };
}

// -----------------------------------------------------------------------------
// Continuité de jointure (diagnostic)
// -----------------------------------------------------------------------------

/**
 * Écart moyen entre les deux bords adjacents d'un buffer raw.
 *
 * Pour une image équirectangulaire valide, la colonne de gauche et la colonne
 * de droite sont voisines dans l'espace réel (l'azimut boucle sur 360°) : elles
 * doivent se ressembler. Un écart élevé trahit une mauvaise couture — c'est un
 * défaut de qualité, pas une raison de refuser le panorama.
 *
 * On échantillonne au plus `maxSamples` lignes pour rester linéaire même sur une
 * image 6000 x 3000 : le coût est constant, pas proportionnel à la surface.
 */
export function computeSeamDelta(
  raw: Buffer,
  width: number,
  height: number,
  channels: number,
  maxSamples = 200
): number {
  if (width < 2 || height < 2 || channels < 1) return 0;
  const stride = width * channels;
  // Garde-fou : un buffer plus court que la géométrie annoncée produirait des
  // lectures `undefined`, donc un `NaN` — qui violerait la contrainte SQL
  // `chk_room_type_panoramas_seam_delta` (0-255) à l'insertion. Mieux vaut
  // renvoyer « aucune mesure » que faire échouer l'enregistrement.
  if (raw.length < stride * height) return 0;

  const step = Math.max(1, Math.floor(height / maxSamples));
  let total = 0;
  let samples = 0;

  for (let y = 0; y < height; y += step) {
    const rowStart = y * stride;
    for (let c = 0; c < channels; c++) {
      const left = raw[rowStart + c];
      const right = raw[rowStart + (width - 1) * channels + c];
      const delta = Math.abs(left - right);
      if (!Number.isFinite(delta)) continue;
      total += delta;
      samples += 1;
    }
  }

  return samples === 0 ? 0 : Math.round(total / samples);
}

function isAcceptedKind(kind: DetectedImageKind): kind is PanoramaKind {
  return (ACCEPTED_KINDS as readonly string[]).includes(kind);
}

/**
 * Valide des octets de panorama. Fonction pure et testable : aucun accès
 * réseau, aucun stockage, aucun état global.
 *
 * L'ordre des vérifications est délibéré : on rejette vite ce qui est
 * manifestement invalide (taille, format) avant de payer un décodage complet.
 */
export async function validatePanoramaBytes(
  input: Buffer,
  policy: PanoramaPolicy = PANORAMA_POLICY
): Promise<PanoramaValidation> {
  // 1. Garde-fous de taille, avant toute lecture coûteuse.
  if (input.length === 0) {
    return reject("empty_file", "Le fichier est vide. Choisissez votre photo 360°.");
  }
  if (input.length < policy.minBytes) {
    return reject("corrupt_image", "Fichier illisible : il est vide ou tronqué.");
  }
  if (input.length > policy.maxBytes) {
    return reject("too_large", "Fichier trop volumineux. La taille maximale acceptée est 40 Mo.");
  }

  // 2. Format RÉEL (magic bytes). Le MIME déclaré et le nom du fichier sont
  //    ignorés : un fichier nommé "360.jpg" n'est pas un panorama, et un JPEG
  //    envoyé avec un MIME "image/png" reste un JPEG.
  const kind = detectImageKind(input);
  if (!isAcceptedKind(kind)) {
    return reject(
      "unsupported_format",
      "Format non supporté. Utilisez une image JPEG, PNG ou WebP."
    );
  }

  // 3. Décodage RÉEL. `failOn: "error"` + lecture raw : sharp parcourt
  //    réellement tous les pixels, donc un fichier tronqué échoue ici même si
  //    ses en-têtes annoncent des dimensions valides.
  let width: number;
  let height: number;
  let raw: Buffer;
  let channels: number;
  try {
    const { data, info } = await sharp(input, { failOn: "error" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    width = info.width;
    height = info.height;
    raw = data;
    channels = info.channels;
  } catch {
    return reject(
      "corrupt_image",
      "Image illisible ou corrompue. Régénérez la photo 360° depuis votre appareil."
    );
  }

  if (width < 2 || height < 2) {
    return reject("invalid_dimensions", "Dimensions de l'image invalides.");
  }

  // 4. Ratio 2:1 — même tolérance que l'ingestion Trouvetou, pour qu'aucun
  //    fichier accepté ici ne soit refusé là-bas.
  if (Math.abs(width / height - 2) > policy.ratioTolerance) {
    return reject(
      "ratio_not_2_1",
      `Format incorrect : l'image doit être panoramique au ratio 2:1 (ex. 6000 × 3000). Image reçue : ${width} × ${height}.`
    );
  }

  // 5. Résolution minimale.
  if (width < policy.minWidth || height < policy.minHeight) {
    return reject(
      "resolution_too_low",
      `Résolution trop faible. Il faut au moins ${policy.minWidth} × ${policy.minHeight} px (reçu : ${width} × ${height}).`
    );
  }

  return {
    ok: true,
    kind,
    contentType: MIME_BY_KIND[kind],
    width,
    height,
    byteSize: input.length,
    seamDelta: computeSeamDelta(raw, width, height, channels),
  };
}


// -----------------------------------------------------------------------------
// Contrat Trouvetou
// -----------------------------------------------------------------------------

/** Seule projection qu'une vraie image équirectangulaire peut déclarer. */
export const PANORAMA_PROJECTION = "equirectangular_2_1";

/** Seule valeur de `media_type` qui déclenche la visionneuse 360°. */
export const PANORAMA_MEDIA_TYPE = "photo_360";

/**
 * Forme attendue dans `attributes.panoramas` par l'ingestion Trouvetou.
 *
 * Tous les champs sont EXPLICITES : sans `media_type` ni `projection`,
 * l'ingestion ne peut pas distinguer une visite 360° d'une image ordinaire
 * rangée dans le même tableau, et une image plate affichée en équirectangulaire
 * produirait exactement la « fausse photo 360° » que la fonctionnalité doit
 * éviter.
 */
export interface TrouvetouPanorama {
  id: string;
  media_type: typeof PANORAMA_MEDIA_TYPE;
  projection: typeof PANORAMA_PROJECTION;
  url: string;
  width: number;
  height: number;
  content_type: string;
  room_id: string;
  validated_at: string;
}

/** URL absolue http(s) sûre, ou null — même règle que côté Trouvetou. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface PanoramaRecord {
  id: string;
  room_type_id: string;
  public_url: string;
  width: number;
  height: number;
  content_type: string;
  validated_at: string | null;
}

/**
 * Construit les entrées `panoramas` d'un type de chambre.
 *
 * Rejette silencieusement toute entrée inexploitable (URL non http(s),
 * dimensions incohérentes, identifiant absent) : une annonce ne doit pas
 * disparaître du catalogue à cause d'une visite 360° corrompue. Les photos
 * classiques de la même annonce restent diffusées normalement.
 */
export function buildTrouvetouPanoramas(records: PanoramaRecord[]): TrouvetouPanorama[] {
  const seen = new Set<string>();
  const panoramas: TrouvetouPanorama[] = [];

  for (const record of records) {
    const url = safeHttpUrl(record.public_url);
    if (!url) continue;
    if (!Number.isInteger(record.width) || !Number.isInteger(record.height)) continue;
    if (record.width <= 0 || record.height <= 0) continue;
    // Même garde que Trouvetou : mieux vaut une visite absente qu'une visite
    // étirée à l'écran.
    if (Math.abs(record.width / record.height - 2) > 0.02) continue;
    if (seen.has(record.id)) continue;
    seen.add(record.id);

    panoramas.push({
      id: record.id,
      media_type: PANORAMA_MEDIA_TYPE,
      projection: PANORAMA_PROJECTION,
      url,
      width: record.width,
      height: record.height,
      content_type: record.content_type,
      room_id: record.room_type_id,
      validated_at: record.validated_at ?? new Date(0).toISOString(),
    });
  }

  return panoramas;
}

// -----------------------------------------------------------------------------
// Séparation des deux flux
// -----------------------------------------------------------------------------

export interface TrouvetouMediaSplit {
  /** Galerie de photos CLASSIQUES. Ne contient jamais un panorama. */
  images: string[];
  /** Visites 360°, champ dédié `attributes.panoramas`. */
  panoramas: TrouvetouPanorama[];
}

/**
 * Sépare la galerie classique des visites 360°.
 *
 * C'est LA fonction qui garantit l'invariant central du système :
 * `photo_360 → images[0]` n'existe pas. Un panorama ne devient jamais une photo
 * plate, et une photo ne devient jamais un panorama.
 *
 * Le filtrage est explicite en plus de la séparation structurelle (table
 * dédiée) : même si une URL de panorama se retrouvait un jour par erreur dans
 * `featured_images`, elle serait retirée de la galerie au lieu d'être rendue
 * comme une vignette écrasée.
 */
export function splitTrouvetouMedia(params: {
  featuredImages: string[];
  logoUrl?: string | null;
  panoramaRecords: PanoramaRecord[];
  maxImages?: number;
}): TrouvetouMediaSplit {
  const { logoUrl, panoramaRecords } = params;
  const maxImages = params.maxImages ?? 4;

  const panoramas = buildTrouvetouPanoramas(panoramaRecords);

  // On compare à la fois l'URL normalisée (celle publiée dans `panoramas`) et
  // l'URL brute stockée : `safeHttpUrl` normalise, donc les deux peuvent différer.
  const panoramaUrls = new Set<string>([
    ...panoramas.map((p) => p.url),
    ...panoramaRecords.map((r) => r.public_url),
  ]);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const raw of params.featuredImages) {
    if (typeof raw !== "string" || raw.trim() === "") continue;
    if (panoramaUrls.has(raw)) continue;
    const url = safeHttpUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push(url);
    if (images.length >= maxImages) break;
  }

  // Repli historique : sans photo de chambre, le logo tient lieu de vignette.
  if (images.length === 0 && logoUrl && logoUrl.length > 0 && !panoramaUrls.has(logoUrl)) {
    const logo = safeHttpUrl(logoUrl);
    if (logo) images.push(logo);
  }

  return { images, panoramas };
}

