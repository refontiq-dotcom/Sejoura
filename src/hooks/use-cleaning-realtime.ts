import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Abonnement temps réel aux tâches de ménage du tenant, avec debounce.
 * Évite le « thundering herd » : plusieurs événements rapprochés ne déclenchent
 * qu'un seul rechargement.
 */
export function useCleaningRealtime(tenantId: string | undefined, onEvent: () => void) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!tenantId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createClient();
    const channel = supabase
      .channel("cleaning-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleaning_tasks", filter: `tenant_id=eq.${tenantId}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => onEventRef.current(), 400);
        }
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tenantId]);
}
