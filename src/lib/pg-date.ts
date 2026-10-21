/**
 * Normalisation des valeurs DATE issues du pilote `pg` vers minuit UTC.
 *
 * Formes réellement prises en charge :
 * - chaîne "YYYY-MM-DD" (comportement par défaut de pg-types pour OID 1082) ;
 * - chaîne ISO complète ("YYYY-MM-DDT00:00:00.000Z", timestamptz) ;
 * - objet Date (parser pg-types surchargé ou colonne timestamptz mappée).
 *
 * Toute autre valeur retourne `Invalid Date` (testée via `isNaN(getTime())`
 * par l'appelant) au lieu de lever un `RangeError` obscur plus tard.
 * Les règles métier (chevauchement, fuseaux) sont préservées : on fige
 * toujours à minuit UTC et on ne tronque jamais à une date locale.
 */
export function normalizePgDateToUtcMidnight(value: unknown): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return new Date(NaN);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const dayMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (dayMatch) {
      const year = Number(dayMatch[1]);
      const month = Number(dayMatch[2]);
      const day = Number(dayMatch[3]);
      if (
        Number.isInteger(year) &&
        Number.isInteger(month) &&
        month >= 1 &&
        month <= 12 &&
        Number.isInteger(day) &&
        day >= 1 &&
        day <= 31
      ) {
        return new Date(Date.UTC(year, month - 1, day));
      }
      return new Date(NaN);
    }
  }
  return new Date(NaN);
}
