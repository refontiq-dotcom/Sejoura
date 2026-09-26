// Optimisation d'images via sharp, guidée par la politique média.
//
// Principes :
//   - détection du format RÉEL par magic bytes (format.ts), jamais le MIME
//     déclaré par le client ;
//   - SVG conservé tel quel (vectoriel, déjà léger) ;
//   - GIF animé conservé tel quel (le pipeline sharp figerait l'animation) ;
//   - tout le reste → WebP avec redimensionnement "inside, withoutEnlargement"
//     (ratio conservé, jamais d'agrandissement) ;
//   - échec de décodage → MediaError "invalid_image" (jamais une stack trace).

import sharp from "sharp";
import { detectImageKind, type DetectedImageKind } from "./format";
import { MediaError } from "./errors";
import type { MediaPolicy } from "./policy";

export interface OptimizedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width: number;
  height: number;
  /** Format d'origine tel que détecté par magic bytes. */
  detectedKind: DetectedImageKind;
  /** True si l'image a été transformée (false : passthrough SVG/GIF). */
  transformed: boolean;
  bytesIn: number;
  bytesOut: number;
}

/** Plancher de dégenerescence : un décodage réussi produit toujours plus que ça. */
export function looksSuspiciouslySmall(bytesOut: number): boolean {
  return bytesOut < 32;
}

export async function optimizeImage(
  input: Buffer,
  policy: MediaPolicy
): Promise<OptimizedImage> {
  const detectedKind = detectImageKind(input);

  // ── Passthrough : formats conservés tels quels ────────────────────────────
  if (detectedKind === "svg" || detectedKind === "gif") {
    const allowed = detectedKind === "svg" ? policy.svgAllowed : policy.gifPassthrough;
    if (!allowed) {
      throw new MediaError("unsupported_format", `svg/gif refusé pour ${policy.kind}`);
    }
    return {
      buffer: input,
      contentType: detectedKind === "svg" ? "image/svg+xml" : "image/gif",
      extension: detectedKind === "svg" ? "svg" : "gif",
      width: 0,
      height: 0,
      detectedKind,
      transformed: false,
      bytesIn: input.length,
      bytesOut: input.length,
    };
  }

  if (
    detectedKind !== "jpeg" &&
    detectedKind !== "png" &&
    detectedKind !== "webp" &&
    detectedKind !== "avif"
  ) {
    throw new MediaError("unsupported_format");
  }

  // ── Pipeline sharp → WebP ─────────────────────────────────────────────────
  try {
    const pipeline = sharp(input, { failOn: "error" })
      .rotate() // respecte l'orientation EXIF des photos smartphone
      .resize({
        width: policy.maxWidth,
        height: policy.maxHeight,
        fit: "inside", // le ratio d'origine est conservé
        withoutEnlargement: true, // jamais d'agrandissement artificiel
      })
      .webp({ quality: policy.quality, effort: 4 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    if (looksSuspiciouslySmall(info.size)) {
      throw new MediaError("processing_failed");
    }

    return {
      buffer: data,
      contentType: policy.outputMime,
      extension: policy.outputExtension,
      width: info.width,
      height: info.height,
      detectedKind,
      transformed: true,
      bytesIn: input.length,
      bytesOut: info.size,
    };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("invalid_image");
  }
}
