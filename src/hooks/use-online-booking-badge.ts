import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types/database";

export function useOnlineBookingBadge(user: User | null) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!user?.tenant_id || !user?.id) return;

    async function load() {
      setLoading(true);
      try {
        const { data: state } = await supabase
          .from("staff_notification_states")
          .select("last_viewed_at")
          .eq("tenant_id", user.tenant_id)
          .eq("user_id", user.id)
          .maybeSingle();

        const lastViewed = state?.last_viewed_at || "2024-01-01T00:00:00Z";

        const { count } = await supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", user.tenant_id)
          .eq("booking_source", "external")
          .gt("created_at", lastViewed)
          .not("status", "in", ["cancelled", "no_show"]);

        setCount(count || 0);
      } catch {
        // Silencieux : le badge est optionnel
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user?.tenant_id, user?.id]);

  async function markAsViewed() {
    if (!user?.tenant_id || !user?.id) return;

    try {
      await supabase.from("staff_notification_states").upsert(
        {
          tenant_id: user.tenant_id,
          user_id: user.id,
          last_viewed_at: new Date().toISOString(),
        },
        {
          onConflict: ["tenant_id", "user_id"],
        }
      );

      setCount(0);
    } catch {
      // Silencieux
    }
  }

  useEffect(() => {
    if (!user?.tenant_id) return;

    const channel = supabase
      .channel(`online-booking-badge-${user.tenant_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `tenant_id=eq.${user.tenant_id} AND booking_source=eq.external`,
        },
        () => {
          setCount((prev) => prev + 1);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `tenant_id=eq.${user.tenant_id} AND booking_source=eq.external`,
        },
        (payload) => {
          if (
            payload.new.status === "cancelled" ||
            payload.new.status === "no_show"
          ) {
            setCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.tenant_id]);

  return { count, loading, markAsViewed };
}
