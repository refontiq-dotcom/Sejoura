// ──────────────────────────────────────────────────────────────────────────────
// Catégorie Trouvetou d'un établissement
//
// Trouvetou référence des catégories par slug (table `categories` du portail) :
//   'hotel', 'residence', 'clinic', 'school', 'other'.
// Seules 'hotel' et 'residence' couvrent l'hébergement géré par Séjoura. La
// fonction d'ingestion du portail (`ingest_listings`) retombe sur la catégorie
// du provider si un slug inconnu est envoyé, mais Séjoura n'envoie que des
// slugs valides.
//
// Le type de l'établissement vit dans `accommodations.accommodation_type`
// (colonne dédiée — migration 20261011). Avant cette migration, il était
// stocké dans `accommodations.description` ('bnb' | 'hotel') : le repli legacy
// ci-dessous conserve la classification correcte des données non migrées.
// ──────────────────────────────────────────────────────────────────────────────

export const ACCOMMODATION_TYPES = ["residence", "hotel"] as const;

export type AccommodationType = (typeof ACCOMMODATION_TYPES)[number];

/** Type appliqué par défaut aux établissements créés sans type explicite. */
export const DEFAULT_ACCOMMODATION_TYPE: AccommodationType = "hotel";

/**
 * Normalise une valeur libre de type d'établissement ('bnb', 'BnB', 'hôtel'…)
 * vers un type supporté. Valeur inconnue → type par défaut.
 */
export function normalizeAccommodationType(
  value: string | null | undefined
): AccommodationType {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "residence" || v === "résidence" || v === "bnb") return "residence";
  if (v === "hotel" || v === "hôtel") return "hotel";
  return DEFAULT_ACCOMMODATION_TYPE;
}

export interface CategorizableAccommodation {
  accommodation_type?: string | null;
  description?: string | null;
}

/**
 * Slug de catégorie Trouvetou à envoyer pour les annonces de l'établissement.
 *
 * Règle :
 *   1. `accommodation_type` (colonne dédiée) s'il est renseigné ;
 *   2. sinon, repli sur l'ancien détournement de `description`
 *      (`description = 'bnb'` → 'residence') pour les données non migrées ;
 *   3. à défaut, 'hotel' (comportement historique).
 */
export function resolveTrouvetouCategorySlug(
  accommodation: CategorizableAccommodation
): AccommodationType {
  const explicit = (accommodation.accommodation_type ?? "").trim().toLowerCase();
  if (explicit === "residence" || explicit === "résidence" || explicit === "bnb") {
    return "residence";
  }
  if (explicit === "hotel" || explicit === "hôtel") {
    return "hotel";
  }
  if (!explicit && (accommodation.description ?? "").trim().toLowerCase() === "bnb") {
    return "residence";
  }
  return DEFAULT_ACCOMMODATION_TYPE;
}
