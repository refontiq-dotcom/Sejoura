"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { canAccessPlanFeature } from "@/lib/utils";
import { getActiveAssignmentId } from "@/lib/assignments";
import { useAccommodation } from "@/hooks/use-accommodation";
import { CleaningSkeleton } from "@/components/ui/skeletons";
import { useCleaningRealtime } from "@/hooks/use-cleaning-realtime";
import { useCleaningActions } from "@/hooks/use-cleaning-actions";
import { useLanguage } from "@/hooks/use-language";
import { translations, type Lang } from "@/lib/translations";
import {
  timeHM,
  countdownTo,
  elapsed,
  isOverdue,
  isLate,
  isDoneToday,
  localDayKey,
} from "@/lib/cleaning-time";
import { estimateTaskMinutes, formatMinutes, workloadLevel } from "@/lib/cleaning-estimates";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Clock,
  AlertCircle,
  CheckCircle2,
  BedDouble,
  Timer,
  Lock,
  Search,
  Eye,
  RefreshCw,
  Building2,
  AlertTriangle,
  Hand,
  TrendingUp,
  Users,
  PartyPopper,
  CalendarClock,
  Gauge,
  Sparkle,
} from "lucide-react";
import type { CleaningTask, Room, Accommodation } from "@/types/database";
import { useCurrentUser } from "@/contexts/current-user-context";

type TaskWithRelations = CleaningTask & { room?: Room; accommodation?: Accommodation };
type StatusFilter = "all" | "pending" | "active" | "done" | "expired" | "alert";

const getStatusLabel = (lang: string, status: string): string => {
  const t = (translations[lang as Lang] ?? translations["fr"]).cleaning;
  const labels: Record<string, string> = {
    pending: t.stats.pending,
    claimed: t.stats.inProgress,
    in_progress: t.stats.inProgress,
    done: t.stats.done,
    expired: t.expired,
  };
  return labels[status] || status;
};

const getStatusMeta = (lang: string) => {
  const t = (translations[lang as Lang] ?? translations["fr"]).cleaning;
  return {
    pending: {
      label: t.stats.pending,
      chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
      bar: "bg-orange-500",
      text: "text-orange-500",
    },
    active: {
      label: t.stats.inProgress,
      chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
      bar: "bg-blue-500",
      text: "text-blue-500",
    },
    done: {
      label: t.stats.done,
      chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
      bar: "bg-emerald-500",
      text: "text-emerald-500",
    },
    expired: {
      label: t.expired,
      chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
      bar: "bg-red-500",
      text: "text-red-500",
    },
  };
};

export default function CleaningPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const t = (translations[lang] ?? translations["fr"]).cleaning;

  const [loading, setLoading] = useState(true);
  const { user, tenantId, plan } = useCurrentUser();
  const userId = user?.id || "";
  const isReadOnly = user?.role === "receptionniste" || user?.role === "admin_residence";
  const isAdmin = user?.role === "admin_residence";
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [maidNames, setMaidNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [accFilter, setAccFilter] = useState<string>("all");
  // Suit la résidence active (header) tant que l'utilisateur n'a pas choisi
  // lui-même un filtre de résidence explicite.
  const { activeAccommodationId } = useAccommodation();
  const userPickedAccFilterRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const { actionTaskId, claim, complete, reopen } = useCleaningActions(userId, {
    onClaimDone: loadData,
    onCompleteDone: loadData,
    onReopenDone: loadData,
  });
  // Nombre de départs prévus demain, par établissement (prévision de charge)
  const [tomorrowCheckouts, setTomorrowCheckouts] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Suit la résidence active (sélecteur du header) : le filtre de résidence
  // suit automatiquement tant que l'utilisateur n'a pas choisi une valeur
  // explicite ("all" ou une résidence précise).
  useEffect(() => {
    if (userPickedAccFilterRef.current) return;
    setAccFilter(activeAccommodationId ?? "all");
  }, [activeAccommodationId]);

  async function loadData() {
    try {
      const supabase = createClient();
      // userId, tenantId, rôle et plan viennent désormais du contexte
      // partagé (déjà chargés par le layout).
      if (!tenantId || !user) return;
      const userData = user;

      const activeAccId = await getActiveAssignmentId(supabase, userData.id, userData.accommodation_id);

      let taskQuery = supabase
        .from("cleaning_tasks")
        .select(`
          *,
          room:rooms(*),
          accommodation:accommodations(*)
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (activeAccId && userData.role !== "admin_residence") {
        taskQuery = taskQuery.eq("accommodation_id", activeAccId);
      }

      const { data: taskData } = await taskQuery;

      if (taskData) {
        const list = taskData as unknown as TaskWithRelations[];
        setTasks(list);

        // Résolution intelligente des noms des ménagères en intervention
        const claimedIds = Array.from(
          new Set(list.filter((t) => t.claimed_by).map((t) => t.claimed_by as string))
        );
        if (claimedIds.length > 0) {
          const { data: usersData } = await supabase
            .from("users")
            .select("id, full_name")
            .in("id", claimedIds);
          const map: Record<string, string> = {};
          (usersData || []).forEach((u) => {
            map[u.id] = u.full_name || t.maid;
          });
          setMaidNames(map);
        }
      }

      // Prévision de charge : réservations avec départ prévu demain
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      let checkoutQuery = supabase
        .from("bookings")
        .select("accommodation_id")
        .eq("tenant_id", userData.tenant_id)
        .eq("check_out_date", localDayKey(tomorrow))
        .in("status", ["confirmed", "checked_in"]);
      if (activeAccId && userData.role !== "admin_residence") {
        checkoutQuery = checkoutQuery.eq("accommodation_id", activeAccId);
      }
      const { data: checkoutData } = await checkoutQuery;
      const counts: Record<string, number> = {};
      (checkoutData || []).forEach((b) => {
        counts[b.accommodation_id] = (counts[b.accommodation_id] || 0) + 1;
      });
      setTomorrowCheckouts(counts);
    } catch (err) {
      toast.error("Les données sont introuvables 🤔 Veuillez réessayer.");
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Temps réel : mise à jour dès qu'une ménagère agit (debouncée)
  useCleaningRealtime(tenantId, () => loadData());

  // ============================================================================
  // Statistiques & intelligence
  // ============================================================================

  const accommodations = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => {
      if (t.accommodation) map.set(t.accommodation.id, t.accommodation.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const stats = useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending").length;
    const active = tasks.filter((t) => t.status === "claimed" || t.status === "in_progress").length;
    const done = tasks.filter((t) => isDoneToday(t, now)).length;
    const alerts = tasks.filter((t) => (t.is_alert_sent || isLate(t, now)) && t.status !== "done").length;
    const activeMaids = new Set(tasks.filter((t) => t.claimed_by).map((t) => t.claimed_by)).size;
    return { pending, active, done, alerts, activeMaids };
  }, [tasks, now]);

  const progress = useMemo(() => {
    const total = stats.done + stats.pending + stats.active;
    return total > 0 ? Math.round((stats.done / total) * 100) : 0;
  }, [stats]);

  // Prochain départ parmi les tâches non terminées (intelligence opérationnelle)
  const nextDeparture = useMemo(() => {
    const upcoming = tasks
      .filter(
        (t) =>
          t.status !== "done" &&
          t.status !== "expired" &&
          t.checkout_time &&
          new Date(t.checkout_time).getTime() > now.getTime()
      )
      .sort((a, b) => new Date(a.checkout_time!).getTime() - new Date(b.checkout_time!).getTime());
    return upcoming[0] || null;
  }, [tasks, now]);

  // Productivité du jour : durée moyenne (prise → terminée) des tâches finies aujourd'hui
  const avgMinutes = useMemo(() => {
    const doneToday = tasks.filter((t) => isDoneToday(t, now) && t.claimed_at && t.completed_at);
    if (doneToday.length === 0) return null;
    const total = doneToday.reduce((acc, t) => acc + (new Date(t.completed_at!).getTime() - new Date(t.claimed_at!).getTime()), 0);
    return Math.round(total / doneToday.length / 60000);
  }, [tasks, now]);

  // Contexte de productivité : moyenne sur les 7 derniers jours + tendance
  const productivityTrend = useMemo(() => {
    const durationsByDay = new Map<string, number[]>();
    tasks
      .filter((t) => t.status === "done" && t.claimed_at && t.completed_at)
      .forEach((t) => {
        const key = localDayKey(new Date(t.completed_at!));
        const dur = new Date(t.completed_at!).getTime() - new Date(t.claimed_at!).getTime();
        if (!durationsByDay.has(key)) durationsByDay.set(key, []);
        durationsByDay.get(key)!.push(dur);
      });

    const todayKey = localDayKey(now);
    const todayList = durationsByDay.get(todayKey) || [];
    // Moyenne des jours précédents (dans la fenêtre de 7 jours)
    const prevAvgs: number[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const list = durationsByDay.get(localDayKey(d));
      if (list && list.length > 0) {
        prevAvgs.push(list.reduce((a, b) => a + b, 0) / list.length);
      }
    }
    const todayAvg =
      todayList.length > 0 ? todayList.reduce((a, b) => a + b, 0) / todayList.length : null;
    const weekAvg = prevAvgs.length > 0 ? prevAvgs.reduce((a, b) => a + b, 0) / prevAvgs.length : null;
    return { todayAvg, weekAvg };
  }, [tasks, now]);

  // Ménagères actuellement en intervention (avec leurs tâches et la charge estimée)
  const activeMaidGroups = useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    tasks
      .filter((t) => (t.status === "claimed" || t.status === "in_progress") && t.claimed_by)
      .forEach((t) => {
        const key = t.claimed_by!;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      });
    return Array.from(map.entries()).map(([id, list]) => ({
      id,
      name: maidNames[id] || "Ménagère",
      tasks: list,
      minutes: list.reduce((acc, t) => acc + estimateTaskMinutes(t), 0),
    }));
  }, [tasks, maidNames]);

  // Avancement par résidence (vue admin multi-établissements)
  const perAccProgress = useMemo(() => {
    if (!isAdmin || accommodations.length < 1) return [];
    return accommodations.map((acc) => {
      const accTasks = tasks.filter((t) => t.accommodation_id === acc.id);
      const done = accTasks.filter((t) => isDoneToday(t, now)).length;
      const pending = accTasks.filter((t) => t.status === "pending").length;
      const active = accTasks.filter((t) => t.status === "claimed" || t.status === "in_progress").length;
      const total = done + pending + active;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const overdue = accTasks.filter((t) => isLate(t, now)).length;
      return { id: acc.id, name: acc.name, done, pending, active, total, pct, overdue };
    });
  }, [tasks, now, isAdmin, accommodations]);

  const filteredTasks = useMemo(() => {
    let list = [...tasks];
    if (accFilter !== "all") {
      list = list.filter((t) => t.accommodation_id === accFilter);
    }
    if (filter === "pending") list = list.filter((t) => t.status === "pending");
    else if (filter === "active") list = list.filter((t) => t.status === "claimed" || t.status === "in_progress");
    else if (filter === "done") list = list.filter((t) => isDoneToday(t, now));
    else if (filter === "expired") list = list.filter((t) => t.status === "expired");
    else if (filter === "alert") list = list.filter((t) => (t.is_alert_sent || isLate(t, now)) && t.status !== "done");

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => {
        const roomNum = t.room?.room_number?.toLowerCase() || "";
        const accName = t.accommodation?.name?.toLowerCase() || "";
        return roomNum.includes(q) || accName.includes(q);
      });
    }
    return list;
  }, [tasks, filter, searchQuery, accFilter, now]);

  const overdueTasks = useMemo(
    () => tasks.filter((t) => isLate(t, now)),
    [tasks, now]
  );

  // Tri intelligent des tâches par colonne
  const columns = useMemo(() => {
    const sortColumn = (list: TaskWithRelations[], status: "pending" | "active" | "done" | "expired"): TaskWithRelations[] => {
      return [...list].sort((a, b) => {
        if (status === "done") {
          const aT = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const bT = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          return bT - aT;
        }
        if (status === "expired") {
          const aT = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bT = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bT - aT;
        }
        if (status === "active") {
          const aClaimed = a.claimed_at ? new Date(a.claimed_at).getTime() : Number.MAX_SAFE_INTEGER;
          const bClaimed = b.claimed_at ? new Date(b.claimed_at).getTime() : Number.MAX_SAFE_INTEGER;
          return aClaimed - bClaimed;
        }
        // pending : urgences (retard) puis priorité puis départ le plus proche
        const aOver = isOverdue(a, now) ? 0 : 1;
        const bOver = isOverdue(b, now) ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        const bp = b.priority ?? 0;
        const ap = a.priority ?? 0;
        if (ap !== bp) return bp - ap;
        const aT = a.checkout_time ? new Date(a.checkout_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bT = b.checkout_time ? new Date(b.checkout_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aT - bT;
      });
    };

    return [
      {
        key: "pending" as const,
        meta: getStatusMeta(lang).pending,
        icon: Clock,
        list: sortColumn(filteredTasks.filter((t) => t.status === "pending"), "pending"),
      },
      {
        key: "active" as const,
        meta: getStatusMeta(lang).active,
        icon: Timer,
        list: sortColumn(filteredTasks.filter((t) => t.status === "claimed" || t.status === "in_progress"), "active"),
      },
      {
        key: "done" as const,
        meta: getStatusMeta(lang).done,
        icon: CheckCircle2,
        list: sortColumn(filteredTasks.filter((t) => isDoneToday(t, now)), "done"),
      },
      {
        key: "expired" as const,
        meta: getStatusMeta(lang).expired,
        icon: AlertTriangle,
        list: sortColumn(filteredTasks.filter((t) => t.status === "expired"), "expired"),
      },
    ];
  }, [filteredTasks, now, lang]);

  if (loading) {
    return <CleaningSkeleton />;
  }

  const hasCleaningAccess = canAccessPlanFeature(plan, "cleaningModule");
  const todayLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-5 animate-fade-in relative">
      {/* Gating plan — barre fine */}
      {!hasCleaningAccess && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="flex-1 text-xs font-medium text-amber-800 dark:text-amber-300">
             {t.proRequiredBadge} <strong>Entreprise</strong>.
          </p>
          <Button size="md" onClick={() => router.push("/dashboard/subscription")}>
             <Sparkles className="w-3.5 h-3.5" /> {t.unlock}
          </Button>
        </div>
      )}

      <div className={`space-y-5 ${!hasCleaningAccess ? "opacity-60 pointer-events-none" : ""}`}>
        {/* ====================================================================
            EN-TÊTE + SYNTHÈSE — bloc sombre unifié
            (un seul bloc synthétique pour les statuts et la progression)
        ==================================================================== */}
        <div className="relative overflow-hidden rounded-2xl bg-[var(--primary-color,#0C1C33)] p-5 text-white shadow-[var(--shadow-lg)]">
          <div className="absolute -right-8 -top-10 w-36 h-36 rounded-full bg-white/5" />
          <div className="absolute right-24 -bottom-14 w-32 h-32 rounded-full bg-white/5" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-[#C2944E]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-white leading-none">{t.title}</h1>
                  {isReadOnly ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-white/80 border border-white/20">
                      <Eye className="w-3 h-3" /> Lecture seule
                    </span>
                  ) : isAdmin ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-white/80 border border-white/20">
                      <Sparkle className="w-3 h-3" /> Supervision
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-white/60 mt-1">{todayLabel}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {overdueTasks.length > 0 && (
                <button
                  onClick={() => setFilter(filter === "alert" ? "all" : "alert")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/90 text-white text-[11px] font-semibold hover:bg-red-500 transition-colors"
                  title={t.viewOverdue}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />                   {overdueTasks.length} {t.overdueLabel.toLowerCase()}
                </button>
              )}
              <button
                onClick={() => {
                  setRefreshing(true);
                  loadData();
                }}
                className="p-2 rounded-xl bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition-colors"
                title={t.refresh}
                aria-label={t.refreshAria}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Synthèse unique des statuts et de la progression */}
          <div className="relative mt-5 pt-5 border-t border-white/10">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: t.stats.pending, value: stats.pending, Icon: Clock },
                { label: t.stats.inProgress, value: stats.active, Icon: Timer },
                { label: t.stats.done, value: stats.done, Icon: CheckCircle2 },
                { label: t.stats.alerts, value: stats.alerts, Icon: AlertCircle },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="rounded-xl bg-white/10 border border-white/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-white/60 truncate">{label}</p>
                    <Icon className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
                  </div>
                  <p className="text-2xl font-bold text-white leading-none mt-1.5 tabular-nums">{value}</p>
                </div>
              ))}
              <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-2.5 col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">{t.progress}</p>
                  <TrendingUp className="w-3.5 h-3.5 text-white/50" />
                </div>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-2xl font-bold text-white leading-none tabular-nums">{progress}%</p>
                  <span className="text-[10px] font-medium text-white/50 pb-0.5 tabular-nums">
                    {stats.done}/{stats.done + stats.pending + stats.active}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-white/15 mt-2 overflow-hidden">
                  <div className="h-full rounded-full bg-[#C2944E] transition-all duration-700" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ====================================================================
            Intelligence : interventions / prochain départ / productivité / prévisions
        ==================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Ménagères en intervention */}
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{t.maidsInAction}</p>
                <p className="text-[11px] text-slate-400">{stats.activeMaids} {t.maidPlural} · {stats.active} {t.taskPlural} {t.inProgressLower}</p>
              </div>
            </div>
            {activeMaidGroups.length === 0 ? (
              <p className="text-xs text-slate-400">{t.noInterventionNow}</p>
            ) : (
              <div className="space-y-2.5">
                {activeMaidGroups.slice(0, 4).map((m) => {
                  const level = workloadLevel(m.minutes);
                  const levelCls =
                    level === "overloaded"
                      ? "text-red-600"
                      : level === "busy"
                      ? "text-amber-600"
                      : "text-blue-600";
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[var(--primary-color,#0C1C33)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{m.name}</span>
                      </span>
                      <span className={`flex items-center gap-1 text-[11px] font-semibold flex-shrink-0 ${levelCls}`}>
                        <Timer className="w-3 h-3" /> {m.tasks.length} · {formatMinutes(m.minutes)}
                      </span>
                    </div>
                  );
                })}
                {activeMaidGroups.length > 4 && (
                  <p className="text-[11px] text-slate-400 text-center pt-0.5">+ {activeMaidGroups.length - 4} {t.others}</p>
                )}
              </div>
            )}
          </Card>

          {/* Prochain départ */}
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <CalendarClock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{t.nextDeparture}</p>
                <p className="text-[11px] text-slate-400">{t.nextDepartureSubtitle}</p>
              </div>
            </div>
            {nextDeparture ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900">
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-900 dark:text-white">{t.taskRoom} {nextDeparture.room?.room_number || "—"}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                    <Building2 className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{nextDeparture.accommodation?.name || ""}</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-amber-600">{timeHM(nextDeparture.checkout_time)}</p>
                  <p className="text-[11px] font-semibold text-slate-500">{countdownTo(nextDeparture.checkout_time!, now)}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">{t.noImminentDeparture}</p>
            )}
          </Card>

          {/* Productivité du jour */}
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                <Gauge className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{t.productivity}</p>
                <p className="text-[11px] text-slate-400">{t.avgDuration}</p>
              </div>
            </div>
            {avgMinutes !== null ? (
              <div className="px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-emerald-600">{avgMinutes} min</span>
                  <span className="text-xs text-slate-500">en moyenne</span>
                </div>
                {(() => {
                  const { todayAvg, weekAvg } = productivityTrend;
                  if (weekAvg === null || todayAvg === null) return null;
                  const delta = Math.round((todayAvg - weekAvg) / 60000);
                  const faster = delta < -5;
                  const slower = delta > 5;
                  if (faster) {
                    return (
                      <p className="text-[11px] font-medium text-emerald-600 mt-1">
                        {Math.abs(delta)} min plus rapide que la moyenne des 7 derniers jours
                      </p>
                    );
                  }
                  if (slower) {
                    return (
                      <p className="text-[11px] font-medium text-amber-600 mt-1">
                        {delta} min plus lent que la moyenne des 7 derniers jours
                      </p>
                    );
                  }
                  return (
                    <p className="text-[11px] font-medium text-slate-500 mt-1">
                      Conforme à la moyenne des 7 derniers jours
                    </p>
                  );
                })()}
              </div>
            ) : (
              <p className="text-xs text-slate-400">{t.noCompletedTasksYet}</p>
            )}
          </Card>

          {/* Prévision de charge : départs prévus demain */}
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                <CalendarClock className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{t.tomorrowCheckouts}</p>
                <p className="text-[11px] text-slate-400">{t.workloadToAnticipate}</p>
              </div>
            </div>
            {(() => {
              const total = Object.values(tomorrowCheckouts).reduce((a, b) => a + b, 0);
              if (total === 0) {
                return <p className="text-xs text-slate-400">{t.noTomorrowCheckouts}</p>;
              }
              return (
                <div className="px-3 py-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-900">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-violet-600">{total}</span>
                    <span className="text-xs text-slate-500">{t.departuresToPrepare}</span>
                  </div>
                  {accommodations.length > 1 && (
                    <div className="mt-2 space-y-1">
                      {accommodations
                        .filter((a) => (tomorrowCheckouts[a.id] || 0) > 0)
                        .map((a) => (
                          <div key={a.id} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 truncate">{a.name}</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 flex-shrink-0">
                              {tomorrowCheckouts[a.id]} ch.{tomorrowCheckouts[a.id] > 1 ? "s" : ""}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>
        </div>

        {/* Filtres & recherche */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]/40"
            />
          </div>

          {accommodations.length > 1 && isAdmin && (
            <div className="relative min-w-[200px]">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <select
                value={accFilter}
                onChange={(e) => {
                  userPickedAccFilterRef.current = true;
                  setAccFilter(e.target.value);
                }}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]/40"
              >
                <option value="all">{t.allResidences}</option>
                {accommodations.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
            {[
              { key: "all", label: t.filters.all },
              { key: "pending", label: t.stats.pending },
              { key: "active", label: t.stats.inProgress },
              { key: "done", label: t.stats.done },
              { key: "expired", label: t.expired },
              { key: "alert", label: t.stats.alerts },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as StatusFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                  filter === f.key
                    ? "bg-[var(--primary-color,#0C1C33)] text-white shadow-md"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Avancement par résidence — vue admin multi-établissements */}
        {isAdmin && accommodations.length > 1 && (
          <Card className="p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary-muted)] flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
              </div>
              <div>
               <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{t.progressByResidence}</p>
               <p className="text-[11px] text-slate-400">{t.workloadDistribution}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {perAccProgress.map((acc) => (
                <div key={acc.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{acc.name}</p>
                    {acc.overdue > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 flex-shrink-0">
                        <AlertTriangle className="w-3 h-3" /> {acc.overdue}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                     <span>{acc.done} / {acc.total} {t.stats.done.toLowerCase()}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{acc.pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--primary-color,#0C1C33)]" style={{ width: `${acc.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Kanban */}
        {filteredTasks.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-[var(--primary-muted)] flex items-center justify-center mx-auto mb-3">
              <PartyPopper className="w-6 h-6 text-[var(--primary-color,#0C1C33)]" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1.5">{t.noTasksTitle}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {t.noTasksCopyFull}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
            {columns.map((col) => (
              <div key={col.key} className="flex flex-col">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${col.meta.chip}`}>
                    <col.icon className="w-3.5 h-3.5" />
                  </span>
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">{col.meta.label}</h3>
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-px">{col.list.length}</span>
                </div>

                <div className="flex-1 space-y-3.5">
                  {col.list.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-5 text-center text-xs text-slate-400">
                       {t.nothingHere}
                    </div>
                  ) : (
                    col.list.map((task) => {
                      const late = isLate(task, now);
                      const active = task.status === "claimed" || task.status === "in_progress";
                      const accentBar = late
                        ? "bg-red-500"
                        : task.status === "done"
                        ? "bg-emerald-500"
                        : active
                        ? "bg-blue-500"
                        : "bg-orange-500";
                      return (
                        <Card
                          key={task.id}
                          className={`p-4 pl-5 overflow-hidden relative ${late ? "border-red-300 dark:border-red-800" : ""}`}
                        >
                          {/* Barre d'accentuation latérale selon l'état */}
                          <span className={`absolute left-0 top-0 bottom-0 w-1 ${accentBar}`} />

                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                late
                                  ? "bg-red-100 dark:bg-red-900/30"
                                  : task.status === "done"
                                  ? "bg-emerald-100 dark:bg-emerald-900/30"
                                  : active
                                  ? "bg-blue-100 dark:bg-blue-900/30"
                                  : "bg-orange-100 dark:bg-orange-900/30"
                              }`}>
                                <BedDouble className={`w-5 h-5 ${
                                  late
                                    ? "text-red-600"
                                    : task.status === "done"
                                    ? "text-emerald-600"
                                    : active
                                    ? "text-blue-600"
                                    : "text-orange-500"
                                }`} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white leading-tight">
                                  Ch. {task.room?.room_number || "—"}
                                </p>
                                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                  <Building2 className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{task.accommodation?.name || ""}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {(task.priority ?? 0) >= 15 && task.status !== "done" && (
                                <Badge variant="warning">
                                  <AlertTriangle className="w-3 h-3" /> {t.priorityLabel}
                                </Badge>
                              )}
                              <Badge variant={task.status === "expired" || late ? "error" : task.status === "done" ? "success" : active ? "info" : "warning"}>
                                {task.status === "expired" ? (
                                  <>
                                    <AlertTriangle className="w-3 h-3" /> {t.expired}
                                  </>
                                ) : late ? (
                                  <>
                                    <AlertCircle className="w-3 h-3" /> {t.overdueLabel}
                                  </>
                                 ) : (
                                   getStatusLabel(lang, task.status) || task.status
                                 )}
                              </Badge>
                            </div>
                          </div>

                          {/* Délais */}
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                            {task.checkout_time && (
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5" /> {t.departure}
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {timeHM(task.checkout_time)}
                                  {!late && task.status !== "done" && (
                                    <span className="text-[var(--primary-color,#0C1C33)] font-semibold ml-1.5">
                                      {countdownTo(task.checkout_time, now)}
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            {task.alert_time && (
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5" /> {t.alert}
                                </span>
                                <span className={`font-medium ${late ? "text-red-600" : "text-slate-700 dark:text-slate-300"}`}>
                                  {timeHM(task.alert_time)}
                                </span>
                              </div>
                            )}
                            {active && task.claimed_at && (
                              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                                <span className="inline-flex items-center gap-1.5">
                                  <Timer className="w-3.5 h-3.5" /> {t.inProgressSince}
                                </span>
                                <span className="font-semibold">{elapsed(task.claimed_at, now)}</span>
                              </div>
                            )}
                            {active && task.claimed_by && (
                              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5" /> {t.by}
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                                   {maidNames[task.claimed_by] || t.maid}
                                </span>
                              </div>
                            )}
                            {task.status === "done" && task.completed_at && (
                              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                                <span className="inline-flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> {t.completedAt}
                                </span>
                                <span className="font-semibold">{timeHM(task.completed_at)}</span>
                              </div>
                            )}
                          </div>

                          {task.notes && (
                            <p className="mt-2.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-400">
                              {task.notes}
                            </p>
                          )}

                          {/* Actions */}
                          <div className="mt-3">
                            {isReadOnly ? (
                              <div className={`text-center text-xs font-medium py-2 rounded-lg ${
                                task.status === "pending"
                                  ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"
                                  : active
                                  ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                                  : task.status === "done"
                                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                                  : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
                              }`}>
                                {task.status === "pending" && t.waitingForMaid}
                                {active && t.cleaningInProgress}
                                {task.status === "done" && t.taskCompleted}
                                {task.status === "expired" && t.taskExpired}
                              </div>
                            ) : (
                              <>
                                {task.status === "pending" && (
                                  <Button
                                    className="w-full"
                                    size="lg"
                                    loading={actionTaskId === task.id}
                                    disabled={actionTaskId !== null}
                                    onClick={() => claim(task.id)}
                                  >
                                    <Hand className="w-4 h-4" /> {t.claimTask}
                                  </Button>
                                )}
                                {active && (
                                  <Button
                                    variant="success"
                                    className="w-full"
                                    size="lg"
                                    loading={actionTaskId === task.id}
                                    disabled={actionTaskId !== null}
                                    onClick={() => complete(task.id)}
                                  >
                                     <CheckCircle2 className="w-4 h-4" /> {t.markCompleted}
                                  </Button>
                                )}
                                {task.status === "done" && (
                                   <div className="text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium py-2">
                                     {t.taskCompleted}
                                   </div>
                                )}
                                {task.status === "expired" && (
                                  <Button
                                    variant="outline"
                                    className="w-full"
                                    size="lg"
                                    loading={actionTaskId === task.id}
                                    disabled={actionTaskId !== null}
                                    onClick={() => reopen(task.id)}
                                  >
                                     <RefreshCw className="w-4 h-4" /> {t.reopenTask}
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
