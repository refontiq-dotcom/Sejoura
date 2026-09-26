// ──────────────────────────────────────────────────────────────────────────────
// Politique média centralisée de Séjoura.
//
// « Upload utilisateur → validation → optimisation appropriée → stockage →
//    affichage responsive et performant. »
//
// Une seule source de vérité : chaque type de média déclare ici ses formats
// d'entrée acceptés, son format de sortie, ses dimensions maximales, sa
// qualité de compression et sa taille d'entrée maximale (le stocké peut être
// bien plus léger grâce à l'optimisation).
// ──────────────────────────────────────────────────────────────────────────────

export type MediaKind = "photo" | "logo" | "ad" | "screenshot";

export interface MediaPolicy {
  /** Type de média. */
  kind: MediaKind;
  /** Types MIME d'entrée décodables puis optimisés (validation serveur, magic bytes). */
  inputMimes: readonly string[];
  /** MIME d'après le nom de fichier, accepté comme info mais jamais seul décisif. */
  label: string;
  /** Format de sortie après optimisation. */
  outputMime: "image/webp";
  outputExtension: string;
  /** Dimensions maximales en sortie (l'image n'est jamais agrandie, ratio conservé). */
  maxWidth: number;
  maxHeight: number;
  /** Qualité de compression (0-100). */
  quality: number;
  /** Taille d'entrée maximale, AVANT optimisation. */
  maxInputBytes: number;
  /** SVG accepté en l'état (vectoriel : aucune conversion WebP). */
  svgAllowed: boolean;
  /** GIF accepté en l'état (animations : passthrough au lieu d'une frame figée). */
  gifPassthrough: boolean;
}

const MB = 1024 * 1024;

/**
 * Photo de chambre / galerie Trouvetou (`featured_images`).
 * Photogrammes smartphone : largeur maximale 1920 px (grand écran + rétine),
 * sortie WebP q80 (garde le canal alpha de PNG/WebP d'origine).
 */
export const PHOTO_POLICY: MediaPolicy = {
  kind: "photo",
  inputMimes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"],
  label: "JPEG, PNG, WebP, AVIF ou GIF",
  outputMime: "image/webp",
  outputExtension: "webp",
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 80,
  maxInputBytes: 12 * MB,
  svgAllowed: false,
  gifPassthrough: false,
};

/**
 * Logo d'établissement (`tenants.logo_url`, affiché ~40-64 px, rétine ×3).
 * Vectoriel SVG conservé tel quel ; rasters limités à 512 px.
 */
export const LOGO_POLICY: MediaPolicy = {
  kind: "logo",
  inputMimes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"],
  label: "PNG, JPEG, WebP, SVG ou GIF",
  outputMime: "image/webp",
  outputExtension: "webp",
  maxWidth: 512,
  maxHeight: 512,
  quality: 85,
  maxInputBytes: 2 * MB,
  svgAllowed: true,
  gifPassthrough: false,
};

/**
 * Affiche publicitaire (`advertisements.image_url`, cartes vitrine ~600-800 px).
 * AVIF accepté en entrée ; sortie WebP q82.
 */
export const AD_POLICY: MediaPolicy = {
  kind: "ad",
  inputMimes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  label: "JPEG, PNG, WebP ou AVIF",
  outputMime: "image/webp",
  outputExtension: "webp",
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 82,
  maxInputBytes: 12 * MB,
  svgAllowed: false,
  gifPassthrough: false,
};

/**
 * Capture d'écran de la boîte à idées (`feature_requests.screenshot_url`,
 * affichée ~600 px). GIF animé conservé (passthrough), plafond généreux.
 */
export const SCREENSHOT_POLICY: MediaPolicy = {
  kind: "screenshot",
  inputMimes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  label: "PNG, JPEG, WebP ou GIF",
  outputMime: "image/webp",
  outputExtension: "webp",
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 80,
  maxInputBytes: 12 * MB,
  svgAllowed: false,
  gifPassthrough: true,
};

export const MEDIA_POLICIES: Record<MediaKind, MediaPolicy> = {
  photo: PHOTO_POLICY,
  logo: LOGO_POLICY,
  ad: AD_POLICY,
  screenshot: SCREENSHOT_POLICY,
};

/** Taille lisible pour les messages utilisateur ("12 Mo", "1,5 Mo"). */
export function humanizeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mo = Math.round((bytes / (1024 * 1024)) * 10) / 10;
    return `${String(mo).replace(".", ",")} Mo`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
}
