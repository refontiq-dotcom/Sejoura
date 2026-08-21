// ============================================================================
// SÉJOURA — ENGINE DE PRICING SAISONNIER
// ============================================================================
//
// Calcule un prix dynamique pour une réservation en fonction de :
//   1. Le jour de la semaine (weekend = surcharge)
//   2. Les jours fériés ivoiriens (Fête de l'Indépendance, Noël, etc.)
//   3. La saison touristique (haute/basse saison)
//   4. Le taux d'occupation récent (moving average 30j)
//
// Tous les prix de référence restent en XOF (FCFA). Les multiplicateurs
// s'appliquent au base_price du type de chambre.
// ============================================================================

// ─── Jours fériés fixes (mois/jour) ─────────────────────────────────────────
// Calendrier ivoirien — les dates fixes qui ne bougent pas d'une année à l'autre.
const FIXED_HOLIDAYS: { month: number; day: number; label: string }[] = [
  { month: 1, day: 1, label: "Jour de l'An" },
  { month: 4, day: 7, label: "Lundi de Pâques" },
  { month: 5, day: 1, label: "Fête du Travail" },
  { month: 5, day: 29, label: "Fête de l'Ascension" },
  { month: 6, day: 9, label: "Lundi de Pentecôte" },
  { month: 8, day: 7, label: "Fête Nationale" },
  { month: 8, day: 15, label: "Assomption" },
  { month: 11, day: 15, label: "Fête de la Paix" },
  { month: 12, day: 25, label: "Noël" },
];

// ─── Jours fériés mobiles (calculés par année) ──────────────────────────────
// Id algorithme de Meeus/Jones/Butcher pour Pâques.
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// ─── Saisons touristiques Côte d'Ivoire ─────────────────────────────────────
// Haute saison : vacances scolaires, fêtes, season humide favorable aux plages
type SeasonType = "low" | "mid" | "high";

function getSeason(month: number): SeasonType {
  // Janvier-février : vacances scolaires → haute saison
  if (month === 1 || month === 2) return "high";
  // Décembre : fêtes de fin d'année → haute saison
  if (month === 12) return "high";
  // Juillet-août : vacances scolaires d'été → haute saison
  if (month === 7 || month === 8) return "high";
  // Mars, juin, septembre, novembre : mi-saison
  if ([3, 6, 9, 11].includes(month)) return "mid";
  // Avril, mai, octobre : basse saison
  return "low";
}

const SEASON_MULTIPLIERS: Record<SeasonType, number> = {
  low: 0.9,   // -10%
  mid: 1.0,   // prix de base
  high: 1.25,  // +25%
};

// ─── Config des surcharges ──────────────────────────────────────────────────

export interface PricingConfig {
  /** Multiplicateur weekend (vendredi soir/dimanche = forte demande en CI) */
  weekendMultiplier: number;
  /** Multiplicateur jour férié */
  holidayMultiplier: number;
  /** Multiplicateurs saison (remplis à partir de SEASON_MULTIPLIERS) */
  seasonMultipliers: Record<SeasonType, number>;
  /** Multiplicateur base d'occupation (0-1) : 0% occupation → 0.85, 100% → 1.35 */
  occupancyMultiplierRange: { min: number; max: number };
  /** Seuil d'alerte : si le prix calculé dépasse ce multiple du prix de base, flag */
  anomalyThreshold: number;
}

const DEFAULT_CONFIG: PricingConfig = {
  weekendMultiplier: 1.15,       // +15% le weekend
  holidayMultiplier: 1.30,       // +30% jour férié
  seasonMultipliers: SEASON_MULTIPLIERS,
  occupancyMultiplierRange: { min: 0.85, max: 1.35 },
  anomalyThreshold: 2.5,
};

// ─── Types publics ──────────────────────────────────────────────────────────

export interface PricingBreakdown {
  basePrice: number;
  seasonMultiplier: number;
  seasonLabel: string;
  weekendMultiplier: number;
  isWeekend: boolean;
  holidayMultiplier: number;
  holidayName: string | null;
  occupancyRate: number;
  occupancyMultiplier: number;
  finalPrice: number;
  totalNights: number;
  totalAmount: number;
  /** Prix sans dynamic pricing (pour comparaison) */
  staticTotal: number;
  /** Économie ou surcoût en FCFA */
  difference: number;
}

// ─── Fonctions pures (testables) ────────────────────────────────────────────

/** Vérifie si une date tomba un jour férié ivoirien */
export function isHoliday(date: Date): string | null {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  // Jours fériés fixes
  for (const h of FIXED_HOLIDAYS) {
    if (h.month === month && h.day === day) return h.label;
  }

  // Jours fériés mobiles (basés sur Pâques)
  const easter = easterDate(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const ascension = new Date(easter);
  ascension.setDate(easter.getDate() + 39);
  const pentecostMonday = new Date(easter);
  pentecostMonday.setDate(easter.getDate() + 50);

  const toKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const target = toKey(date);

  if (toKey(goodFriday) === target) return "Vendredi Saint";
  if (toKey(ascension) === target) return "Ascension";
  if (toKey(pentecostMonday) === target) return "Lundi de Pentecôte";

  return null;
}

/** Détermine si c'est le weekend (vendredi soir, samedi, dimanche) */
export function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  // 0 = dimanche, 5 = vendredi, 6 = samedi
  return day === 0 || day === 5 || day === 6;
}

/**
 * Calcule le multiplicateur d'occupation basé sur un taux d'occupation (0-1).
 * Plus le taux est élevé, plus le prix monte (offre/demande).
 */
export function occupancyMultiplier(
  occupancyRate: number,
  config: PricingConfig = DEFAULT_CONFIG,
): number {
  const { min, max } = config.occupancyMultiplierRange;
  // Interpolation linéaire : 0% → min, 100% → max
  const clamped = Math.max(0, Math.min(1, occupancyRate));
  return min + (max - min) * clamped;
}

// ─── Fonction principale ────────────────────────────────────────────────────

/**
 * Calcule le prix dynamique d'une réservation.
 *
 * @param basePrice     Prix de base (XOF/nuit) du type de chambre
 * @param checkInDate   Date d'arrivée
 * @param checkOutDate  Date de départ
 * @param occupancyRate Taux d'occupation récent (0-1), typiquement 30 jours glissants
 * @param config        Configuration optionnelle (surcharges)
 */
export function calculateDynamicPrice(
  basePrice: number,
  checkInDate: string | Date,
  checkOutDate: string | Date,
  occupancyRate: number = 0.5,
  config: PricingConfig = DEFAULT_CONFIG,
): PricingBreakdown {
  const checkIn = typeof checkInDate === "string" ? new Date(checkInDate) : checkInDate;
  const checkOut = typeof checkOutDate === "string" ? new Date(checkOutDate) : checkOutDate;

  // Nombre de nuits
  const diffMs = checkOut.getTime() - checkIn.getTime();
  const totalNights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  // 1. Multiplicateur saison
  const season = getSeason(checkIn.getMonth() + 1);
  const seasonMultiplier = config.seasonMultipliers[season];
  const seasonLabels: Record<SeasonType, string> = {
    low: "Basse saison",
    mid: "Mi-saison",
    high: "Haute saison",
  };

  // 2. Multiplicateur weekend
  const weekend = isWeekendDate(checkIn);
  const weekendMult = weekend ? config.weekendMultiplier : 1.0;

  // 3. Multiplicateur jour férié (sur la date d'arrivée)
  const holiday = isHoliday(checkIn);
  const holidayMult = holiday ? config.holidayMultiplier : 1.0;

  // 4. Multiplicateur occupation
  const occMult = occupancyMultiplier(occupancyRate, config);

  // Prix par nuit dynamique
  const dynamicPerNight = Math.round(
    basePrice * seasonMultiplier * weekendMult * holidayMult * occMult,
  );

  const finalPrice = dynamicPerNight;
  const totalAmount = dynamicPerNight * totalNights;
  const staticTotal = basePrice * totalNights;
  const difference = totalAmount - staticTotal;

  return {
    basePrice,
    seasonMultiplier,
    seasonLabel: seasonLabels[season],
    weekendMultiplier: weekendMult,
    isWeekend: weekend,
    holidayMultiplier: holidayMult,
    holidayName: holiday,
    occupancyRate,
    occupancyMultiplier: occMult,
    finalPrice,
    totalNights,
    totalAmount,
    staticTotal,
    difference,
  };
}

// ─── Helpers d'affichage ────────────────────────────────────────────────────

/**
 * Génère un résumé lisible du pricing dynamique (pour affichage gérant).
 * Ex : "Haute saison (+25%) · Weekend (+15%) · Occupation 82% (+21%)"
 */
export function formatPricingReason(breakdown: PricingBreakdown): string {
  const parts: string[] = [];

  if (breakdown.seasonMultiplier !== 1.0) {
    const pct = Math.round((breakdown.seasonMultiplier - 1) * 100);
    parts.push(`${breakdown.seasonLabel} (${pct > 0 ? "+" : ""}${pct}%)`);
  }

  if (breakdown.isWeekend) {
    const pct = Math.round((breakdown.weekendMultiplier - 1) * 100);
    parts.push(`Weekend (+${pct}%)`);
  }

  if (breakdown.holidayName) {
    const pct = Math.round((breakdown.holidayMultiplier - 1) * 100);
    parts.push(`${breakdown.holidayName} (+${pct}%)`);
  }

  if (Math.abs(breakdown.occupancyMultiplier - 1.0) > 0.02) {
    const pct = Math.round((breakdown.occupancyMultiplier - 1) * 100);
    const occPct = Math.round(breakdown.occupancyRate * 100);
    parts.push(`Occupation ${occPct}% (${pct > 0 ? "+" : ""}${pct}%)`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Prix standard";
}

/**
 * Retourne la liste des jours fériés d'une année donnée (utile pour
 * afficher un calendrier de surcharges dans le dashboard gérant).
 */
export function getHolidaysForYear(year: number): { date: Date; label: string }[] {
  const holidays: { date: Date; label: string }[] = [];

  for (const h of FIXED_HOLIDAYS) {
    holidays.push({ date: new Date(year, h.month - 1, h.day), label: h.label });
  }

  const easter = easterDate(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const pentecostMonday = new Date(easter);
  pentecostMonday.setDate(easter.getDate() + 50);

  holidays.push({ date: goodFriday, label: "Vendredi Saint" });
  holidays.push({ date: pentecostMonday, label: "Lundi de Pentecôte" });

  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
}
