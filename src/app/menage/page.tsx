"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getActiveAssignmentId } from "@/lib/assignments";
import { useCleaningRealtime } from "@/hooks/use-cleaning-realtime";
import { useCleaningActions } from "@/hooks/use-cleaning-actions";
import {
  timeAgo,
  countdownTo,
  timeHM,
  isOverdue,
  isLate,
  isDoneToday,
} from "@/lib/cleaning-time";
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

export default function MenagePage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const { actionTaskId, claim, complete } = useCleaningActions(tenantId, {
    onClaimDone: () => {
      setFilter("mine");
      loadData();
    },
    onCompleteDone: () => {
      setFilter("done");
      loadData();
    },
  });

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

  // Mise à jour en temps réel : nouvelle tâche, prise, terminée… (debouncée)
  useCleaningRealtime(tenantId, () => loadData());

  // ============================================================================
  // Statistiques
  // ============================================================================

  const stats = useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending" || t.status === "expired");
    const active = tasks.filter((t) => t.status === "claimed" || t.status === "in_progress");
    const mine = active.filter((t) => t.claimed_by === userId);
    const done = tasks.filter((t) => isDoneToday(t, now));
    const overdue = tasks.filter((t) => isLate(t, now));
    return {
      pending: pending.length,
      mine: mine.length,
      done: done.length,
      active: active.length,
      overdue: overdue.length,
    };
  }, [tasks, userId, now]);

  const doneTodayTotal = stats.done + stats.active + stats.pending;
  const progress = doneTodayTotal > 0 ? Math.round((stats.done / doneTodayTotal) * 100) : 0;

  const filteredTasks = useMemo(() => {
    let list: TaskWithRelations[];
    if (filter === "pending") {
      list = tasks.filter((t) => t.status === "pending" || t.status === "expired");
    } else if (filter === "mine") {
      list = tasks.filter((t) => t.claimed_by === userId && (t.status === "claimed" || t.status === "in_progress"));
    } else {
      list = tasks.filter((t) => isDoneToday(t, now));
    }
    // Trier : les plus urgentes (en retard) d'abord, puis priorité, puis
    // départ le plus proche ; les expirées en dernier ; les terminées par
    // ordre de fin décroissant.
    return list.sort((a, b) => {
      if (a.status === "done" || b.status === "done") {
        const aT = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bT = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bT - aT;
      }
      const rank = (t: CleaningTask) => (t.status === "expired" ? 2 : isOverdue(t, now) ? 0 : 1);
      const ar = rank(a);
      const br = rank(b);
      if (ar !== br) return ar - br;
      const ap = a.priority ?? 0;
      const bp = b.priority ?? 0;
      if (ap !== bp) return bp - ap;
      const aT = a.checkout_time ? new Date(a.checkout_time).getTime() : Number.MAX_SAFE_INTEGER;
      const bT = b.checkout_time ? new Date(b.checkout_time).getTime() : Number.MAX_SAFE_INTEGER;
      return aT - bT;
    });
  }, [tasks, filter, userId, now]);

  // Suggestion intelligente : la tâche à prendre en priorité dans le pool
  const suggestion = useMemo(() => {
    if (filter !== "pending") return null;
    return filteredTasks.find((t) => t.status === "pending") || null;
  }, [filteredTasks, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const firstName = userName.trim() ? userName.trim().split(/\s+/)[0] : "";

  return (
    <div className="space-y-4 animate-fade-in max-w-md mx-auto">
      {/* Bandeau de bienvenue */}
      <div className="rounded-2xl bg-[var(--primary-color,#0C1C33)] text-white p-4 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/5" />
        <div className="absolute -right-1 top-8 w-14 h-14 rounded-full bg-white/5" />
        <p className="text-xs font-medium text-white/70">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-lg font-bold mt-0.5">{firstName ? `Bonjour ${firstName}` : "Bonjour !"}</h1>
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
                  ? "border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)] shadow-sm"
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

      {/* Suggestion intelligente : la tâche à prendre en priorité */}
      {suggestion && (
        <div className="rounded-2xl border border-[var(--primary-color,#0C1C33)] bg-[var(--primary-muted)] p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-4 h-4 text-[var(--primary-color,#0C1C33)] flex-shrink-0" />
            <p className="text-xs font-bold text-[var(--primary-color,#0C1C33)]">
              Suggestion : commencez par la Chambre {suggestion.room?.room_number || "—"}
            </p>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            {suggestion.checkout_time
              ? `Départ à ${timeHM(suggestion.checkout_time)} · ${countdownTo(suggestion.checkout_time, now)}`
              : "Sans horaire de départ"}
            {suggestion.priority >= 15 ? " · prioritaire" : ""}
          </p>
          <Button
            size="xl"
            className="w-full mt-2.5"
            loading={actionTaskId === suggestion.id}
            disabled={actionTaskId !== null}
            onClick={() => claim(suggestion.id)}
          >
            <Hand className="w-5 h-5" /> Prendre cette tâche
          </Button>
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
            aria-label="Actualiser la liste"
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
            const late = isLate(task, now);
            const overdue = isOverdue(task, now);
            const isMine = task.claimed_by === userId;
            return (
              <Card
                key={task.id}
                className={`p-4 overflow-hidden ${
                  late ? "border-red-300 dark:border-red-800" : ""
                }`}
              >
                {/* En-tête : chambre + statut */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        late
                          ? "bg-red-100 dark:bg-red-900/30"
                          : task.status === "done"
                          ? "bg-green-100 dark:bg-green-900/30"
                          : isMine
                          ? "bg-blue-100 dark:bg-blue-900/30"
                          : "bg-[var(--primary-muted)]"
                      }`}
                    >
                      <BedDouble
                        className={`w-5 h-5 ${
                          late
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
                    {(task.priority ?? 0) >= 15 && task.status !== "done" && (
                      <Badge variant="warning">
                        <AlertTriangle className="w-3 h-3" /> Prioritaire
                      </Badge>
                    )}
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
                    {isMine && !late && task.status !== "done" && (
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
                    className="w-full"
                    size="xl"
                    loading={actionTaskId === task.id}
                    disabled={actionTaskId !== null}
                    onClick={() => claim(task.id)}
                  >
                    <Hand className="w-5 h-5" /> Prendre la tâche
                  </Button>
                )}
                {(task.status === "claimed" || task.status === "in_progress") && isMine && (
                  <Button
                    variant="success"
                    className="w-full"
                    size="xl"
                    loading={actionTaskId === task.id}
                    disabled={actionTaskId !== null}
                    onClick={() => complete(task.id)}
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
