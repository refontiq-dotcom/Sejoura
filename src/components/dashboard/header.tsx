"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Moon, Sun, Search, Menu, UserCircle, Sparkles, LogOut, Settings, CreditCard } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
  userName?: string;
  userRole?: string;
  plan?: string;
  monthlyPrice?: number;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "info" | "warning" | "success" | "error";
  isRead: boolean;
}

export function Header({ title, subtitle, onMenuClick, userName, userRole, plan, monthlyPrice }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { lang } = useLanguage();
  const t = translations[lang].header;
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: userData } = await supabase
          .from("users")
          .select("tenant_id")
          .eq("auth_user_id", session.user.id)
          .single();

        if (!userData?.tenant_id) return;
        setTenantId(userData.tenant_id);

        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("tenant_id", userData.tenant_id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) return;

        const formatted: NotificationItem[] = (data || []).map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          time: n.created_at ? new Date(n.created_at).toLocaleString("fr-FR") : "",
          type: (n.type as NotificationItem["type"]) || "info",
          isRead: n.is_read,
        }));
        setNotifications(formatted);
      } catch {
        // Erreur silencieuse
      }
    }

    loadNotifications();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleMarkAllRead() {
    if (!tenantId || unreadCount === 0) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("tenant_id", tenantId)
        .eq("is_read", false);

      if (error) {
        toast.error("Impossible de marquer les notifications comme lues.");
        return;
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success("Toutes les notifications ont été marquées comme lues.");
    } catch {
      toast.error("Une erreur est survenue.");
    }
  }

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      toast.error("Impossible de se déconnecter.");
    }
  }

  const notifColors: Record<string, string> = {
    info: "bg-blue-500",
    warning: "bg-orange-500",
    success: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <header className="sticky top-0 z-30 bg-[var(--card)]/80 dark:bg-[var(--card)]/80 backdrop-blur-md border-b border-[var(--border)]">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)]"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
            {subtitle && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)] transition-colors w-10 lg:w-64"
              aria-label={t.searchPlaceholder}
            >
              <Search className="w-4 h-4" />
              <span className="text-sm flex-1 text-left hidden lg:inline">{t.searchPlaceholder}</span>
              <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)]">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>

          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)] transition-colors"
            aria-label={t.themeToggle}
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5 text-yellow-400" />
            )}
          </button>

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
            className="p-2.5 rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)] transition-colors relative"
            aria-label={t.notifications}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-[var(--card)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--foreground)]">{t.notifications}</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      {unreadCount} {t.unread}
                    </span>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-[var(--muted-foreground)] text-sm">
                      {t.noNotifications}
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-4 border-b border-[var(--border)] hover:bg-[var(--muted-hover)] transition-colors cursor-pointer ${
                          !notif.isRead ? "bg-[var(--muted)]" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${notifColors[notif.type]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {notif.title}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                              {notif.message}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">{notif.time}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleMarkAllRead}
                    disabled={unreadCount === 0}
                    className="w-full text-center text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium disabled:opacity-50 disabled:no-underline"
                  >
                    {t.markAllRead}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white font-semibold text-sm hover:ring-2 hover:ring-indigo-300 transition-all"
              aria-label="Profil"
            >
              <UserCircle className="w-5 h-5" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-[var(--card)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden animate-fade-in z-50">
                <div className="p-4 border-b border-[var(--border)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white font-semibold">
                      {userName?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--foreground)] truncate">{userName || "Utilisateur"}</p>
                      <p className="text-xs text-[var(--muted-foreground)] capitalize">{userRole?.replace("_", " ") || "Rôle"}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--muted)]">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--muted-foreground)]">Plan actuel</p>
                    <p className="text-sm font-semibold text-[var(--foreground)] capitalize">{monthlyPrice === 0 ? "Free" : plan || "Free"}</p>
                    </div>
                  </div>
                </div>
                <div className="border-t border-[var(--border)] py-2">
                  <button
                    onClick={() => { setProfileOpen(false); router.push("/dashboard/settings"); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Paramètres
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); router.push("/dashboard/subscription"); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                  >
                    <CreditCard className="w-4 h-4" />
                    Abonnement
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-[var(--muted-hover)] transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Se déconnecter
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Command Palette */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 sm:px-0">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <div className="relative w-full max-w-lg bg-[var(--card)] rounded-2xl shadow-2xl overflow-hidden border border-[var(--border)] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center px-4 py-3 border-b border-[var(--border)]">
              <Search className="w-5 h-5 text-[var(--muted-foreground)] mr-3 flex-shrink-0" />
              <input
                type="text"
                className="flex-1 bg-transparent border-0 focus:ring-0 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] text-base outline-none"
                placeholder="Rechercher des réservations, clients..."
                autoFocus
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)] ml-3">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              <div className="px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">{t.commandPalette}</div>
              <button onClick={() => { router.push("/dashboard/bookings"); setSearchOpen(false); }} className="w-full flex items-center px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--muted-hover)] rounded-xl transition-colors">
                {t.goToBookings}
              </button>
              <button onClick={() => { router.push("/dashboard/residences"); setSearchOpen(false); }} className="w-full flex items-center px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--muted-hover)] rounded-xl transition-colors">
                {t.goToResidences}
              </button>
              <button onClick={() => { router.push("/dashboard/accounting"); setSearchOpen(false); }} className="w-full flex items-center px-3 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--muted-hover)] rounded-xl transition-colors">
                {t.goToAccounting}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
