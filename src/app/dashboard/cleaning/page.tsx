"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import { Sparkles, Loader2, Clock, AlertCircle, CheckCircle2, BedDouble, Timer, Lock } from "lucide-react";
import type { CleaningTask, Room, Accommodation } from "@/types/database";

export default function CleaningPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<(CleaningTask & { room?: Room; accommodation?: Accommodation })[]>([]);
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState("standard");
  const [filter, setFilter] = useState<string>("all");

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
        .select("id, tenant_id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;
      setUserId(userData.id);

      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("tenant_id", userData.tenant_id)
        .single();
      if (subData) setPlan(subData.plan);

      const { data: taskData } = await supabase
        .from("cleaning_tasks")
        .select(`
          *,
          room:rooms(*),
          accommodation:accommodations(*)
        `)
        .eq("tenant_id", userData.tenant_id)
        .order("created_at", { ascending: false });

      if (taskData) {
        setTasks(taskData as unknown as (CleaningTask & { room: Room; accommodation: Accommodation })[]);
      }
    } catch {
      // Erreur silencieuse
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim(taskId: string) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("claim_cleaning_task", {
        p_task_id: taskId,
        p_user_id: userId,
      });

      if (error) {
        alert("Erreur: " + error.message);
        return;
      }

      if (!data) {
        alert("Cette tâche a déjà été prise par une autre ménagère.");
        loadData();
        return;
      }

      loadData();
    } catch {
      // Erreur silencieuse
    }
  }

  async function handleComplete(taskId: string) {
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("complete_cleaning_task", {
        p_task_id: taskId,
        p_user_id: userId,
      });

      if (error) {
        alert("Erreur: " + error.message);
        return;
      }

      loadData();
    } catch {
      // Erreur silencieuse
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "pending") return t.status === "pending";
    if (filter === "claimed") return t.status === "claimed" || t.status === "in_progress";
    if (filter === "done") return t.status === "done";
    if (filter === "alert") return t.is_alert_sent && t.status !== "done";
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

  // Feature gating: module ménage réservé au plan Pro+
  if (plan === "standard") {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ménage</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Module de gestion du ménage automatique</p>
          </div>
        </div>

        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Module Pro requis</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Le module de ménage automatique avec pool de tâches partagé est disponible à partir du plan Pro.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 dark:bg-purple-900/20 mb-6">
            <Badge variant="purple">Pro</Badge>
            <Badge variant="purple">Enterprise</Badge>
          </div>
          <div>
            <Button onClick={() => window.location.href = "/dashboard/subscription"}>
              <Sparkles className="w-4 h-4" /> Mettre à niveau
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ménage</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Pool de tâches partagé — {tasks.length} tâche{tasks.length > 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.pending}</p>
              <p className="text-xs text-slate-400">En attente</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.inProgress}</p>
              <p className="text-xs text-slate-400">En cours</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.done}</p>
              <p className="text-xs text-slate-400">Terminées</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.alerts}</p>
              <p className="text-xs text-slate-400">Alertes</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtres */}
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
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste des tâches */}
      {filteredTasks.length === 0 ? (
        <Card className="p-12 text-center">
          <Sparkles className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Aucune tâche de ménage</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Les tâches sont créées automatiquement lors des check-outs
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => (
            <Card key={task.id} className={`p-5 ${task.is_alert_sent && task.status !== "done" ? "border-red-300 dark:border-red-800" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                    <BedDouble className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">Ch. {task.room?.room_number || "—"}</p>
                    <p className="text-xs text-slate-400">{task.accommodation?.name || ""}</p>
                  </div>
                </div>
                {task.is_alert_sent && task.status !== "done" && (
                  <Badge variant="error">
                    <AlertCircle className="w-3 h-3" /> Alerte
                  </Badge>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Clock className="w-4 h-4" />
                  <span>Départ: {task.checkout_time ? formatDateTime(task.checkout_time) : "—"}</span>
                </div>
                {task.alert_time && (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
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

              {/* Actions */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}