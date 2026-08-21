import type { CleaningTask } from "@/types/database";

// ─── Contexte enrichi pour les estimations intelligentes ───────────────────

export interface RoomCleaningContext {
  /** Surface en m² (optionnel, null si inconnu) */
  surfaceM2: number | null;
  /** Capacité (nombre de personnes max) */
  capacity: number;
  /** Nom du type de chambre (ex: "Studio", "Suite", "Duplex") */
  roomTypeName: string;
  /** Dernier statut de nettoyage de cette chambre */
  lastCleaningStatus?: "recent" | "overdue" | null;
}

// ─── Constantes de l'engine ────────────────────────────────────────────────

/** Minutes de base par surface (minutes / m²) — ex: 1.5 min/m² */
const BASE_MINUTES_PER_SQM = 1.5;

/** Surcharge par personne supplémentaire (au-delà de 2) */
const MINUTES_PER_EXTRA_PERSON = 5;

/** Multiplicateur pour les suites / types premium */
const PREMIUM_MULTIPLIER: Record<string, number> = {
  suite: 1.4,
  duplex: 1.5,
  penthouse: 1.6,
  villa: 1.8,
  studio: 0.85,
  standard: 1.0,
  economy: 0.9,
};

/** Surcharge si le dernier nettoyage est en retard (tâche non complétée à temps) */
const OVERDUE_EXTRA_MINUTES = 15;

// ─── Fonctions de base (rétrocompatibles) ──────────────────────────────────

/**
 * Durée estimée (en minutes) d'une tâche de ménage, selon son type :
 * - check-out (avec checkout_time) : nettoyage complet, plus long ;
 * - ménage en cours de séjour (sans checkout_time) : plus court.
 *
 * @deprecated Utiliser estimateSmartTaskMinutes pour des estimations précises
 */
export function estimateTaskMinutes(task: CleaningTask): number {
  return task.checkout_time ? 45 : 30;
}

/** Charge de travail estimée (minutes) d'un ensemble de tâches actives. */
export function sumEstimatedMinutes(tasks: CleaningTask[]): number {
  return tasks.reduce((acc, t) => acc + estimateTaskMinutes(t), 0);
}

/** Libellé lisible d'une durée en minutes (« 1h15 » / « 45 min »). */
export function formatMinutes(min: number): string {
  if (min <= 0) return "0 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Niveau de charge d'une ménagère selon les minutes estimées en cours :
 * "ok" (< 60 min), "busy" (< 120 min), "overloaded" (>= 120 min).
 */
export function workloadLevel(minutes: number): "ok" | "busy" | "overloaded" {
  if (minutes >= 120) return "overloaded";
  if (minutes >= 60) return "busy";
  return "ok";
}

// ─── Estimations intelligentes (surface + capacité + type chambre) ──────────

/**
 * Estime le temps de nettoyage d'une tâche en prenant en compte :
 * - Le type de tâche (check-out complet vs ménage en cours)
 * - La surface de la chambre (si renseignée)
 * - La capacité (nombre de lits / personnes)
 * - Le type de chambre (studio vs suite vs villa)
 * - Le dernier état de nettoyage
 *
 * Si aucun contexte n'est fourni, retombe sur l'estimation de base.
 */
export function estimateSmartTaskMinutes(
  task: CleaningTask,
  context?: RoomCleaningContext | null,
): number {
  if (!context) return estimateTaskMinutes(task);

  const isCheckout = !!task.checkout_time;

  // 1. Estimation de base selon la surface
  let baseMinutes: number;
  if (context.surfaceM2 && context.surfaceM2 > 0) {
    baseMinutes = Math.round(context.surfaceM2 * BASE_MINUTES_PER_SQM);
  } else {
    // Pas de surface : utiliser un estimateur par capacité
    baseMinutes = isCheckout ? 40 : 25;
    baseMinutes += Math.max(0, context.capacity - 2) * MINUTES_PER_EXTRA_PERSON;
  }

  // 2. Ajustement check-out (nettoyage complet = +50%)
  if (isCheckout) {
    baseMinutes = Math.round(baseMinutes * 1.5);
  }

  // 3. Multiplicateur type de chambre
  const typeName = context.roomTypeName.toLowerCase();
  let multiplier = 1.0;
  for (const [key, mult] of Object.entries(PREMIUM_MULTIPLIER)) {
    if (typeName.includes(key)) {
      multiplier = mult;
      break;
    }
  }
  baseMinutes = Math.round(baseMinutes * multiplier);

  // 4. Surcharge si nettoyage précédent en retard
  if (context.lastCleaningStatus === "overdue") {
    baseMinutes += OVERDUE_EXTRA_MINUTES;
  }

  // Bornes raisonnables : 15 min min, 120 min max
  return Math.max(15, Math.min(120, baseMinutes));
}

/**
 * Charge de travail totale avec estimations intelligentes.
 */
export function sumSmartEstimatedMinutes(
  tasks: CleaningTask[],
  contextMap: Map<string, RoomCleaningContext>,
  roomIdExtractor: (task: CleaningTask) => string,
): number {
  return tasks.reduce((acc, task) => {
    const roomId = roomIdExtractor(task);
    const ctx = contextMap.get(roomId);
    return acc + estimateSmartTaskMinutes(task, ctx);
  }, 0);
}

/**
 * Détaille l'estimation par tâche (utile pour afficher le breakdown).
 */
export function getEstimationBreakdown(
  task: CleaningTask,
  context?: RoomCleaningContext | null,
): {
  baseMinutes: number;
  smartMinutes: number;
  factors: string[];
} {
  const base = estimateTaskMinutes(task);
  const smart = estimateSmartTaskMinutes(task, context);
  const factors: string[] = [];

  if (context?.surfaceM2) {
    factors.push(`Surface ${context.surfaceM2}m²`);
  }
  if (context && context.capacity > 2) {
    factors.push(`${context.capacity} personnes`);
  }
  if (task.checkout_time) {
    factors.push("Check-out complet");
  }
  if (context?.roomTypeName) {
    const typeName = context.roomTypeName.toLowerCase();
    for (const key of Object.keys(PREMIUM_MULTIPLIER)) {
      if (typeName.includes(key) && key !== "standard") {
        factors.push(`Type ${context.roomTypeName}`);
        break;
      }
    }
  }
  if (context?.lastCleaningStatus === "overdue") {
    factors.push("Nettoyage précédent en retard");
  }

  return { baseMinutes: base, smartMinutes: smart, factors };
}
