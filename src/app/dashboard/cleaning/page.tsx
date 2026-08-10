"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, canAccessPlanFeature } from "@/lib/utils";
import { getActiveAssignmentId } from "@/lib/assignments";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Clock, AlertCircle, CheckCircle2, BedDouble, Timer, Lock, Search, Eye } from "lucide-react";
import type { CleaningTask, Room, Accommodation } from "@/types/database";

export default function CleaningPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [tasks, setTasks] = useState<(CleaningTask & { room?: Room; accommodation?: Accommodation })[]>([]);
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

      // Détermine si l'utilisateur est en lecture seule (réceptionniste)
      setIsReadOnly(userData.role === "receptionniste");

      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("tenant_id", userData.tenant_id)
        .single();
      if (subData) setPlan(subData.plan);

      // Résoudre l'établissement actif
      const activeAccId = await getActiveAssignmentId(supabase, userData.id, userData.accommodation_id);

      // Filtrer les tâches de ménage par résidence active pour les ménagères et réceptionnistes
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
        setTasks(taskData as unknown as (CleaningTask & { room: Room; accommodation: Accommodation })[]);
      }
    } catch (err) {
      toast.error("Impossible de charger les données. Veuillez réessayer.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim(taskId: string) {
    if (isReadOnly) {
      toast.error("Action réservée aux ménagères.");
      return;
    }
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("claim_cleaning_task", {
        p_task_id: taskId,
        p_user_id: userId,
      });

      if (error) {
        toast.error("Erreur: " + error.message);
        return;
      }

      if (!data) {
        toast.error("Cette tâche a déjà été prise par une autre ménagère.");
        loadData();
        return;
      }

      loadData();
    } catch (err) {
      toast.error("Impossible de prendre la tâche.");
      console.error(err);
    }
  }

  async function handleComplete(taskId: string) {
    if (isReadOnly) {
      toast.error("Action réservée aux ménagères.");
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("complete_cleaning_task", {
        p_task_id: taskId,
        p_user_id: userId,
      });

      if (error) {
        toast.error("Erreur: " + error.message);
        return;
      }

      loadData();
    } catch (err) {
      toast.error("Impossible de marquer la tâche comme terminée.");
      console.error(err);
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === "pending" && t.status !== "pending") return false;
    if (filter === "claimed" && t.status !== "claimed" && t.status !== "in_progress") return false;
    if (filter === "done" && t.status !== "done") return false;
    if (filter === "alert" && (!t.is_alert_sent || t.status === "done")) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const roomNum = t.room?.room_number?.toLowerCase() || "";
      const accName = t.accommodation?.name?.toLowerCase() || "";
      return roomNum.includes(q) || accName.includes(q);
    }
    return true;
  });

  const stats = {
    pending: tasks.filter((t) => t.status === "pending").length,
    inProgress: tasks.filter((t) => t.status === "claimed" || t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    alerts: tasks.filter((t) => t.is_alert_sent && t.status !== "done").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Feature gating: module ménage réservé à la formule Entreprise
  const hasCleaningAccess = canAccessPlanFeature(plan, "cleaningModule");

  return (
    <div className="space-y-3 animate-fade-in relative">
      {!hasCleaningAccess && !loading && (
        <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Module de gestion du ménage automatique</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Ce module est réservé à la formule Entreprise. Passez à la formule Entreprise pour accéder au pool de tâches partagé.</p>
            </div>
            <Button size="sm" onClick={() => router.push("/dashboard/subscription")}>
              <Sparkles className="w-4 h-4" /> Débloquer avec le plan Entreprise
            </Button>
          </div>
        </Card>
      )}

      <div className={!hasCleaningAccess ? "opacity-60 pointer-events-none" : ""}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Ménage</h1>
              {/* Badge lecture seule visible uniquement pour les réceptionnistes */}
              {isReadOnly && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <Eye className="w-3 h-3" />
                  Lecture seule
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">
              {isReadOnly
                ? "Supervision du ménage — statuts en temps réel"
                : `Pool de tâches partagé — ${tasks.length} tâche${tasks.length > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

      {/* Bannière lecture seule pour les réceptionnistes */}
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3 border-t-4 border-t-orange-500 dark:border-t-orange-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{stats.pending}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">En attente</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 border-t-4 border-t-blue-500 dark:border-t-blue-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{stats.inProgress}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">En cours</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 border-t-4 border-t-green-500 dark:border-t-green-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{stats.done}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Terminées</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 border-t-4 border-t-red-500 dark:border-t-red-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{stats.alerts}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Alertes</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtres & Recherche */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par chambre, établissement..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all", label: "Toutes" },
            { key: "pending", label: "En attente" },
            { key: "claimed", label: "En cours" },
            { key: "done", label: "Terminées" },
            { key: "alert", label: "Alertes" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === f.key
                  ? "bg-[var(--primary-color,#0C1C33)] text-white shadow-md"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des tâches */}
      {filteredTasks.length === 0 ? (
        <Card className="p-12 text-center">
          <Sparkles className="w-12 h-12 text-slate-300 dark:text-slate-600 dark:text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune tâche de ménage</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Les tâches sont créées automatiquement lors des check-outs
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => (
            <Card key={task.id} className={`p-4 border-t-4 ${task.is_alert_sent && task.status !== "done" ? "border-t-red-500 border-red-300 dark:border-red-800" : "border-t-[var(--primary-color,#0C1C33)]"}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                    <BedDouble className="w-5 h-5 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">Ch. {task.room?.room_number || "—"}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{task.accommodation?.name || ""}</p>
                  </div>
                </div>
                {task.is_alert_sent && task.status !== "done" && (
                  <Badge variant="error">
                    <AlertCircle className="w-3 h-3" /> Alerte
                  </Badge>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  <Clock className="w-4 h-4" />
                  <span>Départ: {task.checkout_time ? formatDateTime(task.checkout_time) : "—"}</span>
                </div>
                {task.alert_time && (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    <Timer className="w-4 h-4" />
                    <span>Alerte: {formatDateTime(task.alert_time)}</span>
                  </div>
                )}
                {task.claimed_at && (
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <Sparkles className="w-4 h-4" />
                    <span>Prise en charge: {formatDateTime(task.claimed_at)}</span>
                  </div>
                )}
                {task.completed_at && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Terminée: {formatDateTime(task.completed_at)}</span>
                  </div>
                )}
              </div>

              {/* Actions — masquées pour les réceptionnistes (lecture seule stricte) */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                {isReadOnly ? (
                  /* Vue lecture seule : affiche uniquement le statut */
                  <div className={`text-center text-sm font-medium py-1 rounded-lg ${
                    task.status === "pending"
                      ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"
                      : task.status === "claimed" || task.status === "in_progress"
                      ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                      : task.status === "done"
                      ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
                      : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
                  }`}>
                    {task.status === "pending" && "⏳ En attente d'une ménagère"}
                    {(task.status === "claimed" || task.status === "in_progress") && "🧹 Ménage en cours"}
                    {task.status === "done" && "✓ Tâche terminée"}
                    {task.status === "expired" && "⚠ Tâche expirée"}
                  </div>
                ) : (
                  /* Vue admin : actions disponibles */
                  <>
                    {task.status === "pending" && (
                      <Button className="w-full" size="sm" onClick={() => handleClaim(task.id)}>
                        <Sparkles className="w-4 h-4" /> Prendre la tâche
                      </Button>
                    )}
                    {(task.status === "claimed" || task.status === "in_progress") && (
                      <Button variant="success" className="w-full" size="sm" onClick={() => handleComplete(task.id)}>
                        <CheckCircle2 className="w-4 h-4" /> Marquer terminée
                      </Button>
                    )}
                    {task.status === "done" && (
                      <div className="text-center text-sm text-green-600 dark:text-green-400 font-medium">
                        ✓ Tâche terminée
                      </div>
                    )}
                    {task.status === "expired" && (
                      <div className="text-center text-sm text-red-600 dark:text-red-400 font-medium">
                        ⚠ Tâche expirée (délai dépassé)
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}