import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function useCleaningActions(
  userId: string,
  callbacks: {
    onClaimDone?: () => void;
    onCompleteDone?: () => void;
    onReopenDone?: () => void;
  } = {}
) {
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);

  async function claim(taskId: string) {
    setActionTaskId(taskId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("claim_cleaning_task", {
        p_task_id: taskId,
        p_user_id: userId,
      });
      if (error) {
        toast.error("Oups : " + error.message);
        return;
      }
      if (!data) {
        toast.error("Cette tâche vient d'être prise par une autre ménagère.");
        callbacks.onClaimDone?.();
        return;
      }
      toast.success("Tâche prise en charge ! 💪");
      callbacks.onClaimDone?.();
    } catch {
      toast.error("La tâche n'a pas pu être prise 🔄");
    } finally {
      setActionTaskId(null);
    }
  }

  async function complete(taskId: string) {
    setActionTaskId(taskId);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("complete_cleaning_task", {
        p_task_id: taskId,
        p_user_id: userId,
      });
      if (error) {
        toast.error("Oups : " + error.message);
        return;
      }
      toast.success("Tâche terminée ! 🎉");
      callbacks.onCompleteDone?.();
    } catch {
      toast.error("La tâche n'a pas pu être terminée 🔄");
    } finally {
      setActionTaskId(null);
    }
  }

  async function reopen(taskId: string) {
    setActionTaskId(taskId);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("reopen_cleaning_task", {
        p_task_id: taskId,
      });
      if (error) {
        toast.error("Oups : " + error.message);
        return;
      }
      toast.success("Tâche relancée dans le pool 🔄");
      callbacks.onReopenDone?.();
    } catch {
      toast.error("La relance a échoué 🔄");
    } finally {
      setActionTaskId(null);
    }
  }

  return { actionTaskId, claim, complete, reopen };
}
