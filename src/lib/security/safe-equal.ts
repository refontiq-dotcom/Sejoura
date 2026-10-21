import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparaison de secrets à temps constant, quelle que soit la longueur : les deux
 * valeurs sont d'abord hachées, ce qui donne deux empreintes de même taille.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Vrai si l'en-tête `Authorization` est exactement `Bearer <expected>`. */
export function hasValidBearer(header: string | null, expected: string | undefined): boolean {
  const secret = expected?.trim();
  if (!secret || !header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return Boolean(match) && safeEqual(match![1].trim(), secret);
}
