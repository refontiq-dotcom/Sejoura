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

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  claimed: "En cours",
  in_progress: "En cours",
  done: "Terminée",
  expired: "Expirée",
};

export default function CleaningPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
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
        setTasks(taskData as unknown as TaskWithRelations[]);
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
  // Statistiques & filtres
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
    const todayKey = new Date().toISOString().slice(0, 10);
    const done = tasks.filter((t) => t.status === "done" && t.completed_at && t.completed_at.slice(0, 10) === todayKey).length;
    const alerts = tasks.filter((t) => (t.is_alert_sent || isOverdue(t, now)) && t.status !== "done").length;
    const activeMaids = new Set(tasks.filter((t) => t.claimed_by).map((t) => t.claimed_by)).size;
    return { pending, active, done, alerts, activeMaids };
  }, [tasks, now]);

  const progress = useMemo(() => {
    const total = stats.done + stats.pending + stats.active;
    return total > 0 ? Math.round((stats.done / total) * 100) : 0;
  }, [stats]);

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

  const columns = useMemo(() => {
    const cols: { key: string; title: string; icon: typeof BedDouble; tint: string; list: TaskWithRelations[] }[] = [
      {
        key: "pending",
        title: "En attente",
        icon: Clock,
        tint: "text-orange-500 bg-orange-100 dark:bg-orange-900/30",
        list: filteredTasks.filter((t) => t.status === "pending"),
      },
      {
        key: "active",
        title: "En cours",
        icon: Timer,
        tint: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
        list: filteredTasks.filter((t) => t.status === "claimed" || t.status === "in_progress"),
      },
      {
        key: "done",
        title: "Terminées",
        icon: CheckCircle2,
        tint: "text-green-600 bg-green-100 dark:bg-green-900/30",
        list: filteredTasks.filter((t) => t.status === "done"),
      },
    ];
    return cols;
  }, [filteredTasks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-color,#0C1C33)]" />
      </div>
    );
  }

  const hasCleaningAccess = canAccessPlanFeature(plan, "cleaningModule");

  return (
    <div className="space-y-4 animate-fade-in relative">
      {/* Gating plan */}
      {!hasCleaningAccess && (
        <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
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
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Ménage</h1>
            {isReadOnly && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <Eye className="w-3 h-3" /> Lecture seule
              </span>
            )}
          </div>
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

        {/* Bannière lecture seule réceptionniste */}
        {isReadOnly && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
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
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-xs font-medium text-red-700 dark:text-red-300">
              {overdueTasks.length} tâche{overdueTasks.length > 1 ? "s" : ""} en retard :{" "}
              {overdueTasks.slice(0, 3).map((t) => `Ch. ${t.room?.room_number || "—"}`).join(", ")}
              {overdueTasks.length > 3 && ` et ${overdueTasks.length - 3} autre(s)`}
            </p>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">En attente</p>
              <Clock className="w-4 h-4 text-orange-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.pending}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">En cours</p>
              <Timer className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.active}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Terminées (jour)</p>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.done}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Alertes</p>
              <AlertCircle className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.alerts}</p>
          </Card>
          <Card className="p-4 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Progression</p>
              <TrendingUp className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
            </div>
            <div className="mt-1.5">
              <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{progress}%</p>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 mt-2 overflow-hidden">
                <div className="h-full rounded-full bg-[var(--primary-color,#0C1C33)]" style={{ width: `${progress}%` }} />
              </div>
            </div>
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

        {/* Vue d'ensemble : qui travaille */}
        {stats.activeMaids > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary-muted)] border border-[var(--primary-color)]/10 text-xs text-slate-600 dark:text-slate-300">
            <Users className="w-4 h-4 text-[var(--primary-color,#0C1C33)]" />
            <span>
              <strong className="text-slate-900 dark:text-white">{stats.activeMaids}</strong> ménagère{stats.activeMaids > 1 ? "s" : ""} actuellement en intervention sur {stats.active} tâche{stats.active > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Kanban */}
        {filteredTasks.length === 0 ? (
          <Card className="p-12 text-center">
            <PartyPopper className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune tâche de ménage</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Les tâches sont créées automatiquement lors des check-outs.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {columns.map((col) => (
              <div key={col.key} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${col.tint}`}>
                    <col.icon className="w-4 h-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{col.title}</h3>
                  <span className="text-xs font-bold text-slate-400">{col.list.length}</span>
                </div>

                {col.list.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-400">
                    Rien ici
                  </div>
                ) : (
                  col.list.map((task) => {
                    const overdue = isOverdue(task, now);
                    const active = task.status === "claimed" || task.status === "in_progress";
                    return (
                      <Card
                        key={task.id}
                        className={`p-4 ${overdue ? "border-red-300 dark:border-red-800" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              overdue
                                ? "bg-red-100 dark:bg-red-900/30"
                                : task.status === "done"
                                ? "bg-green-100 dark:bg-green-900/30"
                                : active
                                ? "bg-blue-100 dark:bg-blue-900/30"
                                : "bg-[var(--primary-muted)]"
                            }`}>
                              <BedDouble className={`w-5 h-5 ${
                                overdue
                                  ? "text-red-600"
                                  : task.status === "done"
                                  ? "text-green-600"
                                  : active
                                  ? "text-blue-600"
                                  : "text-[var(--primary-color,#0C1C33)]"
                              }`} />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white leading-tight">
                                Ch. {task.room?.room_number || "—"}
                              </p>
                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3" />
                                {task.accommodation?.name || ""}
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
                        <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                          {task.checkout_time && (
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" /> Départ
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {timeHM(task.checkout_time)}
                                {!overdue && task.status !== "done" && (
                                  <span className="text-[var(--primary-color,#0C1C33)] font-semibold ml-1">
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
                          {task.status === "done" && task.completed_at && (
                            <div className="flex items-center justify-between text-green-600 dark:text-green-400">
                              <span className="inline-flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Terminée à
                              </span>
                              <span className="font-semibold">{timeHM(task.completed_at)}</span>
                            </div>
                          )}
                        </div>

                        {task.notes && (
                          <p className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-400">
                            {task.notes}
                          </p>
                        )}

                        {/* Actions */}
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                          {isReadOnly ? (
                            <div className={`text-center text-xs font-medium py-2 rounded-lg ${
                              task.status === "pending"
                                ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"
                                : active
                                ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                                : task.status === "done"
                                ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
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
                                <div className="text-center text-xs text-green-600 dark:text-green-400 font-medium py-2">
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
