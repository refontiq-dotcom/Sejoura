"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { canAccessPlanFeature } from "@/lib/utils";
import { getActiveAssignmentId } from "@/lib/assignments";
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

type TaskWithRelations = CleaningTask & { room?: Room; accommodation?: Accommodation };
type StatusFilter = "all" | "pending" | "active" | "done" | "alert";

// ============================================================================
// Helpers temps
// ============================================================================

function minutesBetween(fromIso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60000));
}

function timeHM(dateIso: string | null): string {
  if (!dateIso) return "";
  return new Date(dateIso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function countdownTo(dateIso: string, now: Date): string {
  const diff = new Date(dateIso).getTime() - now.getTime();
  if (diff <= 0) return "dépassé";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  return `dans ${h}h${String(min % 60).padStart(2, "0")}`;
}

function elapsed(fromIso: string, now: Date): string {
  const min = minutesBetween(fromIso, now);
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, "0")}`;
}

function isOverdue(task: CleaningTask, now: Date): boolean {
  return (
    (task.status === "pending" || task.status === "claimed" || task.status === "in_progress") &&
    !!task.alert_time &&
    new Date(task.alert_time).getTime() < now.getTime()
  );
}

function isDoneToday(task: CleaningTask, now: Date): boolean {
  if (task.status !== "done" || !task.completed_at) return false;
  return task.completed_at.slice(0, 10) === now.toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  claimed: "En cours",
  in_progress: "En cours",
  done: "Terminée",
  expired: "Expirée",
};

const STATUS_META: Record<string, { label: string; chip: string; bar: string; text: string }> = {
  pending: {
    label: "En attente",
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    bar: "bg-orange-500",
    text: "text-orange-500",
  },
  active: {
    label: "En cours",
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    bar: "bg-blue-500",
    text: "text-blue-500",
  },
  done: {
    label: "Terminées",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    bar: "bg-emerald-500",
    text: "text-emerald-500",
  },
};

export default function CleaningPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [maidNames, setMaidNames] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [plan, setPlan] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [accFilter, setAccFilter] = useState<string>("all");
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

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
        .select("id, tenant_id, role, accommodation_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setUserId(userData.id);
      setTenantId(userData.tenant_id);
      setIsReadOnly(userData.role === "receptionniste");
      setIsAdmin(userData.role === "admin_residence" || userData.role === "super_admin");

      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("tenant_id", userData.tenant_id)
        .single();
      if (subData) setPlan(subData.plan);

      const activeAccId = await getActiveAssignmentId(supabase, userData.id, userData.accommodation_id);

      let taskQuery = supabase
        .from("cleaning_tasks")
        .select(`
          *,
          room:rooms(*),
          accommodation:accommodations(*)
        `)
        .eq("tenant_id", userData.tenant_id)
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
            map[u.id] = u.full_name || "Ménagère";
          });
          setMaidNames(map);
        }
      }
    } catch (err) {
      toast.error("Impossible de charger les données. Veuillez réessayer.");
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Temps réel : mise à jour dès qu'une ménagère agit
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("cleaning-supervision")
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
        toast.error("Cette tâche a déjà été prise par une ménagère.");
        loadData();
        return;
      }
      toast.success("Tâche prise en charge.");
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
      toast.success("Tâche marquée comme terminée.");
      loadData();
    } catch {
      toast.error("Impossible de marquer la tâche comme terminée.");
    } finally {
      setActionTaskId(null);
    }
  }

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
    const alerts = tasks.filter((t) => (t.is_alert_sent || isOverdue(t, now)) && t.status !== "done").length;
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
      .filter((t) => t.status !== "done" && t.checkout_time && new Date(t.checkout_time).getTime() > now.getTime())
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

  // Ménagères actuellement en intervention (avec leurs tâches)
  const activeMaidGroups = useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    tasks
      .filter((t) => (t.status === "claimed" || t.status === "in_progress") && t.claimed_by)
      .forEach((t) => {
        const key = t.claimed_by!;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      });
    return Array.from(map.entries()).map(([id, list]) => ({ id, name: maidNames[id] || "Ménagère", tasks: list }));
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
      const overdue = accTasks.filter((t) => isOverdue(t, now) && t.status !== "done").length;
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
    else if (filter === "done") list = list.filter((t) => t.status === "done");
    else if (filter === "alert") list = list.filter((t) => (t.is_alert_sent || isOverdue(t, now)) && t.status !== "done");

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
    () => tasks.filter((t) => isOverdue(t, now)),
    [tasks, now]
  );

  // Tri intelligent des tâches par colonne
  const columns = useMemo(() => {
    const sortColumn = (list: TaskWithRelations[], status: "pending" | "active" | "done"): TaskWithRelations[] => {
      return [...list].sort((a, b) => {
        if (status === "done") {
          const aT = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const bT = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          return bT - aT;
        }
        if (status === "active") {
          const aClaimed = a.claimed_at ? new Date(a.claimed_at).getTime() : Number.MAX_SAFE_INTEGER;
          const bClaimed = b.claimed_at ? new Date(b.claimed_at).getTime() : Number.MAX_SAFE_INTEGER;
          return aClaimed - bClaimed;
        }
        // pending : urgences (retard) puis départ le plus proche
        const aOver = isOverdue(a, now) ? 0 : 1;
        const bOver = isOverdue(b, now) ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        const aT = a.checkout_time ? new Date(a.checkout_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bT = b.checkout_time ? new Date(b.checkout_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aT - bT;
      });
    };

    return [
      {
        key: "pending" as const,
        meta: STATUS_META.pending,
        icon: Clock,
        list: sortColumn(filteredTasks.filter((t) => t.status === "pending"), "pending"),
      },
      {
        key: "active" as const,
        meta: STATUS_META.active,
        icon: Timer,
        list: sortColumn(filteredTasks.filter((t) => t.status === "claimed" || t.status === "in_progress"), "active"),
      },
      {
        key: "done" as const,
        meta: STATUS_META.done,
        icon: CheckCircle2,
        list: sortColumn(filteredTasks.filter((t) => t.status === "done"), "done"),
      },
    ];
  }, [filteredTasks, now]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const hasCleaningAccess = canAccessPlanFeature(plan, "cleaningModule");
  const todayLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Gating plan */}
      {!hasCleaningAccess && (
        <Card className="p-5 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Module de gestion du ménage automatique</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Ce module est réservé à la formule Entreprise. Passez à la formule Entreprise pour accéder au pool de tâches partagé.
              </p>
            </div>
            <Button size="sm" onClick={() => router.push("/dashboard/subscription")}>
              <Sparkles className="w-4 h-4" /> Débloquer avec le plan Entreprise
            </Button>
          </div>
        </Card>
      )}

      <div className={!hasCleaningAccess ? "opacity-60 pointer-events-none" : ""}>
        {/* ====================================================================
            HERO — bandeau de synthèse
        ==================================================================== */}
        <div className="relative overflow-hidden rounded-3xl bg-[var(--primary-color,#0C1C33)] p-6 text-white shadow-[var(--shadow-lg)]">
          <div className="absolute -right-10 -top-12 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute right-10 -bottom-16 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute right-32 top-8 w-16 h-16 rounded-full bg-white/5" />

          <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-white/60">{todayLabel}</p>
              <h1 className="text-xl font-bold mt-1 flex items-center gap-2.5">
                Suivi du ménage
                {isReadOnly ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 text-white border border-white/20">
                    <Eye className="w-3 h-3" /> Lecture seule
                  </span>
                ) : isAdmin ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 text-white border border-white/20">
                    <Sparkle className="w-3 h-3" /> Supervision
                  </span>
                ) : null}
              </h1>
              <p className="text-xs text-white/60 mt-1 max-w-md">
                Tâches de ménage générées automatiquement aux départs. Vue en temps réel de l&apos;avancement du pool.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {nextDeparture && (
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/10 border border-white/15 text-sm">
                  <CalendarClock className="w-4 h-4 text-white/80" />
                  <span className="text-xs text-white/80">Prochain départ</span>
                  <span className="font-bold">Ch. {nextDeparture.room?.room_number || "—"}</span>
                  <span className="text-xs font-semibold text-white/90">
                    {timeHM(nextDeparture.checkout_time)} · {countdownTo(nextDeparture.checkout_time!, now)}
                  </span>
                </div>
              )}
              <button
                onClick={() => {
                  setRefreshing(true);
                  loadData();
                }}
                className="p-2.5 rounded-2xl bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition-colors"
                title="Actualiser"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Progression du jour */}
          <div className="relative mt-6">
            <div className="flex items-center justify-between text-[11px] font-semibold mb-1.5">
              <span className="text-white/70 uppercase tracking-wider">Progression du jour</span>
              <span className="text-white font-bold">{progress}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#C2944E] transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center gap-5 mt-3 text-xs">
              <span className="flex items-center gap-1.5 text-white/80">
                <span className="w-2 h-2 rounded-full bg-orange-400" /> {stats.pending} en attente
              </span>
              <span className="flex items-center gap-1.5 text-white/80">
                <span className="w-2 h-2 rounded-full bg-blue-400" /> {stats.active} en cours
              </span>
              <span className="flex items-center gap-1.5 text-white/80">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> {stats.done} terminées
              </span>
              {stats.alerts > 0 && (
                <span className="flex items-center gap-1.5 text-red-300">
                  <AlertCircle className="w-3 h-3" /> {stats.alerts} alerte{stats.alerts > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bannière lecture seule réceptionniste */}
        {isReadOnly && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Vue supervision — lecture seule</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Vous pouvez consulter l&apos;avancement du ménage en temps réel. La prise en charge et la validation des tâches sont réservées aux ménagères.
              </p>
            </div>
            <Lock className="w-4 h-4 text-amber-500 ml-auto flex-shrink-0" />
          </div>
        )}

        {/* Alerte retards */}
        {overdueTasks.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-xs font-medium text-red-700 dark:text-red-300">
              <strong>{overdueTasks.length} tâche{overdueTasks.length > 1 ? "s" : ""} en retard</strong> :{" "}
              {overdueTasks.slice(0, 3).map((t) => `Ch. ${t.room?.room_number || "—"}`).join(", ")}
              {overdueTasks.length > 3 && ` et ${overdueTasks.length - 3} autre(s)`}
            </p>
          </div>
        )}

        {/* ====================================================================
            KPIs
        ==================================================================== */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <Card className="p-5 hover:shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">En attente</p>
              <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                <Clock className="w-4 h-4 text-orange-500" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2 leading-none">{stats.pending}</p>
            <p className="text-[11px] text-slate-400 mt-1.5">à prendre dans le pool</p>
          </Card>

          <Card className="p-5 hover:shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">En cours</p>
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Timer className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2 leading-none">{stats.active}</p>
            <p className="text-[11px] text-slate-400 mt-1.5">interventions actives</p>
          </Card>

          <Card className="p-5 hover:shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Terminées (jour)</p>
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2 leading-none">{stats.done}</p>
            <p className="text-[11px] text-slate-400 mt-1.5">aujourd&apos;hui</p>
          </Card>

          <Card className="p-5 hover:shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Alertes</p>
              <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-red-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2 leading-none">{stats.alerts}</p>
            <p className="text-[11px] text-slate-400 mt-1.5">délais dépassés</p>
          </Card>

          <Card className="p-5 hover:shadow-[var(--shadow-lg)] col-span-2 md:col-span-3 xl:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Progression</p>
              <div className="w-9 h-9 rounded-xl bg-[var(--primary-muted)] flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2 leading-none">{progress}%</p>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 mt-3 overflow-hidden">
              <div className="h-full rounded-full bg-[var(--primary-color,#0C1C33)]" style={{ width: `${progress}%` }} />
            </div>
          </Card>
        </div>

        {/* ====================================================================
            Intelligence : interventions / prochain départ / productivité
        ==================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Ménagères en intervention */}
          <Card className="p-5 hover:shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Ménagères en intervention</p>
                <p className="text-[11px] text-slate-400">{stats.activeMaids} ménagère{stats.activeMaids > 1 ? "s" : ""} · {stats.active} tâche{stats.active > 1 ? "s" : ""} en cours</p>
              </div>
            </div>
            {activeMaidGroups.length === 0 ? (
              <p className="text-xs text-slate-400">Aucune intervention en ce moment.</p>
            ) : (
              <div className="space-y-2.5">
                {activeMaidGroups.slice(0, 4).map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-[var(--primary-color,#0C1C33)] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{m.name}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 flex-shrink-0">
                      <Timer className="w-3 h-3" /> {m.tasks.length} en cours
                    </span>
                  </div>
                ))}
                {activeMaidGroups.length > 4 && (
                  <p className="text-[11px] text-slate-400 text-center pt-1">+ {activeMaidGroups.length - 4} autre{activeMaidGroups.length - 4 > 1 ? "s" : ""}</p>
                )}
              </div>
            )}
          </Card>

          {/* Prochain départ */}
          <Card className="p-5 hover:shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <CalendarClock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Prochain départ</p>
                <p className="text-[11px] text-slate-400">échéance à anticiper</p>
              </div>
            </div>
            {nextDeparture ? (
              <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900">
                <div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">Ch. {nextDeparture.room?.room_number || "—"}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3" /> {nextDeparture.accommodation?.name || ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-600">{timeHM(nextDeparture.checkout_time)}</p>
                  <p className="text-[11px] font-semibold text-slate-500">{countdownTo(nextDeparture.checkout_time!, now)}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Aucun départ imminent. Tout est sous contrôle.</p>
            )}
          </Card>

          {/* Productivité du jour */}
          <Card className="p-5 hover:shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Gauge className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Productivité du jour</p>
                <p className="text-[11px] text-slate-400">durée moyenne d&apos;une intervention</p>
              </div>
            </div>
            {avgMinutes !== null ? (
              <div className="flex items-baseline gap-1.5 px-3 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900">
                <span className="text-2xl font-bold text-emerald-600">{avgMinutes} min</span>
                <span className="text-xs text-slate-500">en moyenne</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Aucune tâche terminée aujourd&apos;hui pour le moment.</p>
            )}
          </Card>
        </div>

        {/* Filtres & recherche */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher par chambre, établissement..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]/40"
            />
          </div>

          {accommodations.length > 1 && isAdmin && (
            <div className="relative min-w-[200px]">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <select
                value={accFilter}
                onChange={(e) => setAccFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0C1C33)]/40"
              >
                <option value="all">Tous les établissements</option>
                {accommodations.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {[
              { key: "all", label: "Toutes" },
              { key: "pending", label: "En attente" },
              { key: "active", label: "En cours" },
              { key: "done", label: "Terminées" },
              { key: "alert", label: "Alertes" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as StatusFilter)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
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
          <Card className="p-5 hover:shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-[var(--primary-muted)] flex items-center justify-center">
                <Building2 className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Avancement par établissement</p>
                <p className="text-[11px] text-slate-400">répartition de la charge entre vos résidences</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {perAccProgress.map((acc) => (
                <div key={acc.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{acc.name}</p>
                    {acc.overdue > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 flex-shrink-0">
                        <AlertTriangle className="w-3 h-3" /> {acc.overdue}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                    <span>{acc.done} / {acc.total} terminées</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{acc.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--primary-color,#0C1C33)]" style={{ width: `${acc.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Kanban */}
        {filteredTasks.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--primary-muted)] flex items-center justify-center mx-auto mb-4">
              <PartyPopper className="w-8 h-8 text-[var(--primary-color,#0C1C33)]" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Aucune tâche de ménage</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Les tâches sont créées automatiquement lors des check-outs. Dès qu&apos;un client libère une chambre, elle apparaîtra ici en temps réel.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
            {columns.map((col) => (
              <div key={col.key} className="flex flex-col">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${col.meta.chip}`}>
                    <col.icon className="w-4 h-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{col.meta.label}</h3>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{col.list.length}</span>
                </div>

                <div className="flex-1 space-y-3.5">
                  {col.list.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-400">
                      Rien ici
                    </div>
                  ) : (
                    col.list.map((task) => {
                      const overdue = isOverdue(task, now);
                      const active = task.status === "claimed" || task.status === "in_progress";
                      const accentBar = overdue
                        ? "bg-red-500"
                        : task.status === "done"
                        ? "bg-emerald-500"
                        : active
                        ? "bg-blue-500"
                        : "bg-orange-500";
                      return (
                        <Card
                          key={task.id}
                          className={`p-4.5 pl-5 overflow-hidden relative ${overdue ? "border-red-300 dark:border-red-800" : ""}`}
                        >
                          {/* Barre d'accentuation latérale selon l'état */}
                          <span className={`absolute left-0 top-0 bottom-0 w-1 ${accentBar}`} />

                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                overdue
                                  ? "bg-red-100 dark:bg-red-900/30"
                                  : task.status === "done"
                                  ? "bg-emerald-100 dark:bg-emerald-900/30"
                                  : active
                                  ? "bg-blue-100 dark:bg-blue-900/30"
                                  : "bg-orange-100 dark:bg-orange-900/30"
                              }`}>
                                <BedDouble className={`w-5 h-5 ${
                                  overdue
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
                            <Badge variant={overdue ? "error" : task.status === "done" ? "success" : active ? "info" : "warning"}>
                              {overdue ? (
                                <>
                                  <AlertCircle className="w-3 h-3" /> En retard
                                </>
                              ) : (
                                STATUS_LABEL[task.status] || task.status
                              )}
                            </Badge>
                          </div>

                          {/* Délais */}
                          <div className="mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-700/60 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                            {task.checkout_time && (
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5" /> Départ
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {timeHM(task.checkout_time)}
                                  {!overdue && task.status !== "done" && (
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
                                  <AlertCircle className="w-3.5 h-3.5" /> Alerte
                                </span>
                                <span className={`font-medium ${overdue ? "text-red-600" : "text-slate-700 dark:text-slate-300"}`}>
                                  {timeHM(task.alert_time)}
                                </span>
                              </div>
                            )}
                            {active && task.claimed_at && (
                              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                                <span className="inline-flex items-center gap-1.5">
                                  <Timer className="w-3.5 h-3.5" /> En cours depuis
                                </span>
                                <span className="font-semibold">{elapsed(task.claimed_at, now)}</span>
                              </div>
                            )}
                            {active && task.claimed_by && (
                              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5" /> Par
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                                  {maidNames[task.claimed_by] || "Ménagère"}
                                </span>
                              </div>
                            )}
                            {task.status === "done" && task.completed_at && (
                              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                                <span className="inline-flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Terminée à
                                </span>
                                <span className="font-semibold">{timeHM(task.completed_at)}</span>
                              </div>
                            )}
                          </div>

                          {task.notes && (
                            <p className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-400">
                              {task.notes}
                            </p>
                          )}

                          {/* Actions */}
                          <div className="mt-4">
                            {isReadOnly ? (
                              <div className={`text-center text-xs font-medium py-2.5 rounded-xl ${
                                task.status === "pending"
                                  ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"
                                  : active
                                  ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                                  : task.status === "done"
                                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                                  : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
                              }`}>
                                {task.status === "pending" && "En attente d'une ménagère"}
                                {active && "Ménage en cours"}
                                {task.status === "done" && "Tâche terminée"}
                                {task.status === "expired" && "Tâche expirée"}
                              </div>
                            ) : (
                              <>
                                {task.status === "pending" && (
                                  <Button
                                    className="w-full h-10 text-xs rounded-xl"
                                    size="sm"
                                    loading={actionTaskId === task.id}
                                    disabled={actionTaskId !== null}
                                    onClick={() => handleClaim(task.id)}
                                  >
                                    <Hand className="w-4 h-4" /> Prendre la tâche
                                  </Button>
                                )}
                                {active && (
                                  <Button
                                    variant="success"
                                    className="w-full h-10 text-xs rounded-xl"
                                    size="sm"
                                    loading={actionTaskId === task.id}
                                    disabled={actionTaskId !== null}
                                    onClick={() => handleComplete(task.id)}
                                  >
                                    <CheckCircle2 className="w-4 h-4" /> Marquer terminée
                                  </Button>
                                )}
                                {task.status === "done" && (
                                  <div className="text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium py-2">
                                    Tâche terminée
                                  </div>
                                )}
                                {task.status === "expired" && (
                                  <div className="text-center text-xs text-red-600 dark:text-red-400 font-medium py-2">
                                    Tâche expirée (délai dépassé)
                                  </div>
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
