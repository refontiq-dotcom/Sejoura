"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type NotificationItem = {
  id: string;
  tenant_id: string;
  recipient_role: string | null;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdBy: string | null;
  time: string;
};

type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({
  tenantId,
  userId,
  userRole,
  children,
}: {
  tenantId: string;
  userId: string;
  userRole: string;
  children: ReactNode;
}) {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  async function loadNotifications() {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(`recipient_role.is.null,recipient_role.eq.${userRole}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return;

    const filtered = (data || []).filter((n: any) => {
      if (n.created_by && n.created_by === userId) return false;
      return true;
    });

    setNotifications(
      filtered.map((n: any) => ({
        id: n.id,
        tenant_id: n.tenant_id,
        recipient_role: n.recipient_role,
        title: n.title,
        message: n.message,
        type: n.type,
        link: n.link,
        isRead: n.is_read,
        readAt: n.read_at,
        createdBy: n.created_by,
        time: n.created_at,
      }))
    );
  }

  useEffect(() => {
    if (!tenantId) return;
    loadNotifications();

    const channel = supabase
      .channel(`notifications-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => loadNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, userRole, userId]);

  async function markAsRead(id: string) {
    try {
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
    } catch {
      // Silencieux
    }
  }

  async function markAllAsRead() {
    if (!tenantId) return;
    try {
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("is_read", false);

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
    } catch {
      // Silencieux
    }
  }

  const pathname = usePathname();

  async function autoMarkReadByPath() {
    if (!pathname || !tenantId) return;
    const matches = notifications.filter((n) => n.link && !n.isRead && pathname === n.link);
    if (matches.length === 0) return;
    try {
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in("id", matches.map((n) => n.id));

      setNotifications((prev) =>
        prev.map((n) => (matches.some((m) => m.id === n.id) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
    } catch {
      // Silencieux
    }
  }

  useEffect(() => {
    autoMarkReadByPath();
  }, [pathname, notifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        refresh: loadNotifications,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
