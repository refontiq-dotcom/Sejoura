// Classification d'URLs médias : R2 vs stockages historiques (Supabase,
// OAuth avatars, etc.). Les anciennes URLs ne sont jamais réécrites ni
// déplacées : elles continuent de fonctionner telles quelles.

/**
 * True si une URL pointe vers le stockage média R2 (base R2_PUBLIC_BASE_URL).
 */
export function isMediaFromR2(url: string): boolean {
  const base = (process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return false;
  return url.startsWith(`${base}/`);
}
