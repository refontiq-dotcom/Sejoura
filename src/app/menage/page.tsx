"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import { Sparkles, Loader2, Clock, AlertCircle, CheckCircle2, BedDouble, Timer } from "lucide-react";
import type { CleaningTask, Room, Accommodation } from "@/types/database";

export default function MenagePage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<(CleaningTask & { room?: Room; accommodation?: Accommodation })[]>([]);
  const [userId, setUserId] = useState("");
  const [filter, setFilter] = useState<string>("pending");

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

      if (error) { alert("Erreur: " + error.message); return; }
      if (!data) { alert("Cette tâche a déjà été prise."); loadData(); return; }
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
      if (error) { alert("Erreur: " + error.message); return; }
      loadData();
    } catch {
      // Erreur silencieuse
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === "pending") return t.status === "pending";
    if (filter === "mine") return t.claimed_by === userId;
    if (filter === "done") return t.status === "done";
    return true;
  });

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const myCount = tasks.filter((t) => t.claimed_by === userId).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
          <p className="text-xs text-slate-400">En attente</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{myCount}</p>
          <p className="text-xs text-slate-400">Mes tâches</p>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {[
          { key: "pending", label: "À prendre" },
          { key: "mine", label: "Mes tâches" },
          { key: "done", label: "Terminées" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
              filter === f.key
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {filteredTasks.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filter === "pending" ? "Aucune tâche en attente" : filter === "mine" ? "Vous n'avez pas de tâche en cours" : "Aucune tâche terminée"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <Card key={task.id} className={`p-4 ${task.is_alert_sent && task.status !== "done" ? "border-red-300" : ""}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BedDouble className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">
                      Ch. {task.room?.room_number || "—"}
                    </p>
                    <p className="text-xs text-slate-400">{task.accommodation?.name || ""}</p>
                  </div>
                </div>
                {task.is_alert_sent && task.status !== "done" && (
                  <Badge variant="error"><AlertCircle className="w-3 h-3" /></Badge>
                )}
              </div>

              {task.checkout_time && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                  <Clock className="w-3.5 h-3.5" />
                  Départ: {formatDateTime(task.checkout_time)}
                </div>
              )}

              {task.status === "pending" && (
                <Button className="w-full" size="sm" onClick={() => handleClaim(task.id)}>
                  <Sparkles className="w-4 h-4" /> Prendre la tâche
                </Button>
              )}
              {(task.status === "claimed" || task.status === "in_progress") && task.claimed_by === userId && (
                <Button variant="success" className="w-full" size="sm" onClick={() => handleComplete(task.id)}>
                  <CheckCircle2 className="w-4 h-4" /> Terminer
                </Button>
              )}
              {task.status === "done" && (
                <div className="text-center text-xs text-green-600 font-medium">
                  ✓ Terminée {task.completed_at ? formatDateTime(task.completed_at) : ""}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}