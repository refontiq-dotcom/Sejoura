"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getActiveAssignmentId } from "@/lib/assignments";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Clock,
  AlertCircle,
  CheckCircle2,
  BedDouble,
  Timer,
  AlertTriangle,
  Hand,
  PartyPopper,
  RefreshCw,
  Building2,
} from "lucide-react";
import type { CleaningTask, Room, Accommodation } from "@/types/database";

type FilterKey = "pending" | "mine" | "done";

interface TaskWithRelations extends CleaningTask {
  room?: Room;
  accommodation?: Accommodation;
}

// ============================================================================
// Helpers temps
// ============================================================================

function minutesBetween(fromIso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60000));
}

function timeAgo(fromIso: string, now: Date): string {
  const min = minutesBetween(fromIso, now);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h${String(min % 60).padStart(2, "0")}`;
  return `il y a ${h}h`;
}

function countdownTo(dateIso: string, now: Date): string {
  const diff = new Date(dateIso).getTime() - now.getTime();
  if (diff <= 0) return "dépassé";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  return `dans ${h}h${String(min % 60).padStart(2, "0")}`;
}

function timeHM(dateIso: string | null): string {
  if (!dateIso) return "";
  return new Date(dateIso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function isOverdue(alertTime: string | null, status: string, now: Date): boolean {
  return (
    (status === "pending" || status === "claimed" || status === "in_progress") &&
    !!alertTime &&
    new Date(alertTime).getTime() < now.getTime()
  );
}

export default function MenagePage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Horloge pour les temps relatifs / délais
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id, tenant_id, accommodation_id, full_name")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setUserId(userData.id);
      setTenantId(userData.tenant_id);
      if (userData.full_name) setUserName(userData.full_name);

      const activeAccId = await getActiveAssignmentId(supabase, userData.id, userData.accommodation_id);

      let query = supabase
        .from("cleaning_tasks")
        .select(`
          *,
          room:rooms(*),
          accommodation:accommodations(*)
        `)
        .eq("tenant_id", userData.tenant_id)
        .order("created_at", { ascending: false });

      if (activeAccId) {
        query = query.eq("accommodation_id", activeAccId);
      }

      const { data: taskData } = await query;
      if (taskData) {
        setTasks(taskData as unknown as TaskWithRelations[]);
      }
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Mise à jour en temps réel : nouvelle tâche, prise, terminée…
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("menage-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleaning_tasks", filter: `tenant_id=eq.${tenantId}` },
        () => loadData()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  async function handleClaim(taskId: string) {
    setActionTaskId(taskId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("claim_cleaning_task", {
        p_task_id: taskId,
        p_user_id: userId,
      });
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      if (!data) {
        toast.error("Cette tâche vient d'être prise par une autre ménagère.");
        loadData();
        return;
      }
      toast.success("Tâche prise en charge !");
      setFilter("mine");
      loadData();
    } catch {
      toast.error("Impossible de prendre la tâche.");
    } finally {
      setActionTaskId(null);
    }
  }

  async function handleComplete(taskId: string) {
    setActionTaskId(taskId);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("complete_cleaning_task", {
        p_task_id: taskId,
        p_user_id: userId,
      });
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      toast.success("Tâche terminée, bravo !");
      setFilter("done");
      loadData();
    } catch {
      toast.error("Impossible de marquer la tâche comme terminée.");
    } finally {
      setActionTaskId(null);
    }
  }

  // ============================================================================
  // Statistiques
  // ============================================================================

  const stats = useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending");
    const mine = tasks.filter((t) => t.claimed_by === userId && (t.status === "claimed" || t.status === "in_progress"));
    const todayKey = new Date().toISOString().slice(0, 10);
    const done = tasks.filter(
      (t) => t.status === "done" && t.completed_at && t.completed_at.slice(0, 10) === todayKey
    );
    const overdue = tasks.filter((t) => isOverdue(t.alert_time, t.status, now));
    return { pending: pending.length, mine: mine.length, done: done.length, overdue: overdue.length };
  }, [tasks, userId, now]);

  const doneTodayTotal = stats.done + stats.mine + stats.pending;
  const progress = doneTodayTotal > 0 ? Math.round((stats.done / doneTodayTotal) * 100) : 0;

  const filteredTasks = useMemo(() => {
    let list: TaskWithRelations[];
    if (filter === "pending") {
      list = tasks.filter((t) => t.status === "pending");
    } else if (filter === "mine") {
      list = tasks.filter((t) => t.claimed_by === userId && (t.status === "claimed" || t.status === "in_progress"));
    } else {
      list = tasks.filter((t) => t.status === "done");
    }
    // Trier : les plus urgentes (départ le plus proche) d'abord
    return list.sort((a, b) => {
      const aT = a.checkout_time ? new Date(a.checkout_time).getTime() : Number.MAX_SAFE_INTEGER;
      const bT = b.checkout_time ? new Date(b.checkout_time).getTime() : Number.MAX_SAFE_INTEGER;
      return aT - bT;
    });
  }, [tasks, filter, userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const firstName = userName.split(" ")[0] || "Bonjour";

  return (
    <div className="space-y-4 animate-fade-in max-w-md mx-auto">
      {/* Bandeau de bienvenue */}
      <div className="rounded-2xl bg-[var(--primary-color,#0C1C33)] text-white p-4 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/5" />
        <div className="absolute -right-1 top-8 w-14 h-14 rounded-full bg-white/5" />
        <p className="text-xs font-medium text-white/70">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-lg font-bold mt-0.5">Bonjour {firstName}</h1>
        <p className="text-xs text-white/70 mt-0.5">
          {stats.pending > 0
            ? `${stats.pending} tâche${stats.pending > 1 ? "s" : ""} en attente sur le pool`
            : stats.mine > 0
            ? `${stats.mine} tâche${stats.mine > 1 ? "s" : ""} en cours`
            : "Tout est en ordre, belle journée !"}
        </p>

        {/* Progression du jour */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-medium mb-1">
            <span className="text-white/80">Progression du jour</span>
            <span className="text-white font-bold">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#C2944E] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Compteurs rapides */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            key: "pending" as FilterKey,
            label: "À prendre",
            value: stats.pending,
            icon: Hand,
            cls: stats.overdue > 0 ? "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10" : "",
            accent: stats.overdue > 0 ? "text-red-600" : "text-orange-500",
          },
          {
            key: "mine" as FilterKey,
            label: "Mes tâches",
            value: stats.mine,
            icon: Sparkles,
            cls: "border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10",
            accent: "text-blue-600",
          },
          {
            key: "done" as FilterKey,
            label: "Terminées",
            value: stats.done,
            icon: CheckCircle2,
            cls: "border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-900/10",
            accent: "text-green-600",
          },
        ].map(({ key, label, value, icon: Icon, cls, accent }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`p-3 rounded-2xl border text-center transition-all active:scale-95 ${
                active
                  ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-light,#F0F4FF)] shadow-sm"
                  : `bg-white dark:bg-slate-800 ${cls}`
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Icon className={`w-4 h-4 ${accent}`} />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{value}</span>
              </div>
              <p className={`text-[11px] mt-0.5 font-medium ${active ? "text-[var(--primary-color,#0C1C33)]" : "text-slate-400"}`}>
                {label}
              </p>
            </button>
          );
        })}
      </div>

      {/* Alerte tâches en retard */}
      {stats.overdue > 0 && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300">
            {stats.overdue} tâche{stats.overdue > 1 ? "s" : ""} en retard — les clients attendent.
          </p>
        </div>
      )}

      {/* Liste des tâches */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {filter === "pending" && "Tâches disponibles"}
            {filter === "mine" && "Mes tâches en cours"}
            {filter === "done" && "Terminées aujourd'hui"}
          </h2>
          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {filteredTasks.length === 0 ? (
          <Card className="p-8 text-center">
            {filter === "done" ? (
              <PartyPopper className="w-10 h-10 text-green-400 mx-auto mb-3" />
            ) : (
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {filter === "pending" && "Aucune tâche en attente. Profitez-en !"}
              {filter === "mine" && "Vous n'avez pas de tâche en cours. Prenez une tâche !"}
              {filter === "done" && "Aucune tâche terminée aujourd'hui"}
            </p>
          </Card>
        ) : (
          filteredTasks.map((task) => {
            const overdue = isOverdue(task.alert_time, task.status, now);
            const isMine = task.claimed_by === userId;
            return (
              <Card
                key={task.id}
                className={`p-4 overflow-hidden ${
                  overdue ? "border-red-300 dark:border-red-800" : ""
                }`}
              >
                {/* En-tête : chambre + statut */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        overdue
                          ? "bg-red-100 dark:bg-red-900/30"
                          : task.status === "done"
                          ? "bg-green-100 dark:bg-green-900/30"
                          : isMine
                          ? "bg-blue-100 dark:bg-blue-900/30"
                          : "bg-[var(--primary-light,#F0F4FF)]"
                      }`}
                    >
                      <BedDouble
                        className={`w-5 h-5 ${
                          overdue
                            ? "text-red-600"
                            : task.status === "done"
                            ? "text-green-600"
                            : isMine
                            ? "text-blue-600"
                            : "text-[var(--primary-color,#0C1C33)]"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                        Chambre {task.room?.room_number || "—"}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" />
                        {task.accommodation?.name || ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {overdue && (
                      <Badge variant="error">
                        <AlertCircle className="w-3 h-3" /> En retard
                      </Badge>
                    )}
                    {task.status === "done" && (
                      <Badge variant="success">
                        <CheckCircle2 className="w-3 h-3" /> Terminée
                      </Badge>
                    )}
                    {isMine && !overdue && task.status !== "done" && (
                      <Badge variant="info">
                        <Sparkles className="w-3 h-3" /> En cours
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Note chambre occupée */}
                {task.notes && task.notes.includes("occupée") && (
                  <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 mb-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{task.notes}</p>
                  </div>
                )}

                {/* Délais */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {task.checkout_time && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Départ {timeHM(task.checkout_time)}
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {countdownTo(task.checkout_time, now)}
                      </span>
                    </span>
                  )}
                  {task.claimed_at && isMine && (
                    <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                      <Timer className="w-3.5 h-3.5" />
                      Pris {timeAgo(task.claimed_at, now)}
                    </span>
                  )}
                  {task.status === "done" && task.completed_at && (
                    <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Finie {timeHM(task.completed_at)}
                    </span>
                  )}
                </div>

                {/* Actions : gros boutons tactiles */}
                {task.status === "pending" && (
                  <Button
                    className="w-full h-12 text-sm rounded-xl"
                    size="md"
                    loading={actionTaskId === task.id}
                    disabled={actionTaskId !== null}
                    onClick={() => handleClaim(task.id)}
                  >
                    <Hand className="w-5 h-5" /> Prendre la tâche
                  </Button>
                )}
                {(task.status === "claimed" || task.status === "in_progress") && isMine && (
                  <Button
                    variant="success"
                    className="w-full h-12 text-sm rounded-xl"
                    size="md"
                    loading={actionTaskId === task.id}
                    disabled={actionTaskId !== null}
                    onClick={() => handleComplete(task.id)}
                  >
                    <CheckCircle2 className="w-5 h-5" /> Marquer terminée
                  </Button>
                )}
                {(task.status === "claimed" || task.status === "in_progress") && !isMine && (
                  <div className="w-full h-12 rounded-xl bg-slate-50 dark:bg-slate-700/30 flex items-center justify-center text-xs font-medium text-slate-400">
                    <Timer className="w-4 h-4 mr-1.5" /> En cours par une collègue
                  </div>
                )}
                {task.status === "done" && (
                  <div className="w-full h-12 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-sm font-semibold text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-5 h-5 mr-1.5" /> Tâche terminée
                  </div>
                )}
                {task.status === "expired" && (
                  <div className="w-full h-12 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-sm font-semibold text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 mr-1.5" /> Expirée (délai dépassé)
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
