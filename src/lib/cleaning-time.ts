import type { CleaningTask } from "@/types/database";

export function minutesBetween(fromIso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60000));
}

export function timeAgo(fromIso: string, now: Date): string {
  const min = minutesBetween(fromIso, now);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h${String(min % 60).padStart(2, "0")}`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j ${h % 24}h`;
}

export function countdownTo(dateIso: string, now: Date): string {
  const diff = new Date(dateIso).getTime() - now.getTime();
  if (diff <= 0) return "dépassé";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  return `dans ${h}h${String(min % 60).padStart(2, "0")}`;
}

export function timeHM(dateIso: string | null): string {
  if (!dateIso) return "";
  return new Date(dateIso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function elapsed(fromIso: string, now: Date): string {
  const min = minutesBetween(fromIso, now);
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, "0")}`;
}

const ACTIVE_STATUSES = ["pending", "claimed", "in_progress"] as const;

/** Délai (alert_time) dépassé sur une tâche encore active. */
export function isOverdue(task: CleaningTask, now: Date): boolean {
  return (
    ACTIVE_STATUSES.includes(task.status as (typeof ACTIVE_STATUSES)[number]) &&
    !!task.alert_time &&
    new Date(task.alert_time).getTime() < now.getTime()
  );
}

/** Tâche « en retard » au sens large : délai dépassé ou statut expiré. */
export function isLate(task: CleaningTask, now: Date): boolean {
  return task.status === "expired" || isOverdue(task, now);
}

/** Tâche terminée aujourd'hui (comparaison sur le jour local, insensible au fuseau). */
export function isDoneToday(task: CleaningTask, now: Date): boolean {
  if (task.status !== "done" || !task.completed_at) return false;
  return isSameLocalDay(task.completed_at, now);
}

export function isSameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Clé de jour locale (YYYY-MM-DD), insensible au fuseau UTC. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
