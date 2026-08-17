import type { CleaningTask } from "@/types/database";

/**
 * Durée estimée (en minutes) d'une tâche de ménage, selon son type :
 * - check-out (avec checkout_time) : nettoyage complet, plus long ;
 * - ménage en cours de séjour (sans checkout_time) : plus court.
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
