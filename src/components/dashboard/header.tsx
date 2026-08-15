"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bell, Moon, Sun, Search, Menu, Sparkles, LogOut, Settings, CreditCard, Building2, ChevronDown, Check, HelpCircle, Bug, Wand2 } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import { LOGIN_ROUTE, EMPLOYEE_LOGIN_ROUTE } from "@/lib/routes";
import { useAccommodation } from "@/hooks/use-accommodation";
import { getPlanLabel } from "@/lib/utils";
import { IdeaSubmissionModal } from "@/components/dashboard/idea-box";
import type { FeatureRequestCategory } from "@/types/database";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
  userName?: string;
  userRole?: string;
  userEmail?: string | null;
  avatarUrl?: string | null;
  lastLogin?: string | null;
  companyName?: string;
  plan?: string;
  monthlyPrice?: number;
  scrolled?: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "info" | "warning" | "success" | "error";
  isRead: boolean;
  link?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "ADMIN",
  admin_residence: "GÉRANT",
  receptionniste: "RÉCEPTIONNISTE",
  menagere: "MÉNAGÈRE",
  client: "CLIENT",
};

const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-sky-600",
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function UserAvatar({
  name,
  src,
  className = "",
}: {
  name?: string;
  src?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const displayName = name || "Utilisateur";
  const showImage = Boolean(src) && !failed;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src as string}
        alt={displayName}
        onError={() => setFailed(true)}
        className={`rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-gradient-to-br ${avatarGradient(displayName)} flex items-center justify-center text-white font-semibold select-none ${className}`}
      aria-hidden
    >
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}

// ============================================================================
// SÉLECTEUR DE RÉSIDENCE (Header)
// - 1 seule résidence : badge simple avec le nom
// - Plusieurs résidences : dropdown permettant de basculer en 1 clic
// ============================================================================
function ResidenceSwitcher() {
  const { lang } = useLanguage();
  const t = translations[lang].header;
  const { accommodations, activeAccommodationId, activeAccommodation, setActiveAccommodationId } = useAccommodation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (accommodations.length === 0) return null;

  // Une seule résidence : badge simple
  if (accommodations.length === 1) {
    return (
      <span
        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--primary-muted)] text-[var(--primary-muted-foreground)] text-xs font-semibold border border-[var(--primary-color)]/20 max-w-[200px]"
        title={accommodations[0].name}
      >
        <Building2 className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)] flex-shrink-0" />
        <span className="truncate">{accommodations[0].name}</span>
      </span>
    );
  }

  // Plusieurs résidences : dropdown
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-full bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors max-w-[52px] md:max-w-[220px]"
        aria-label={t.switchResidence}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
        <span className="hidden md:inline text-xs font-medium truncate">
          {activeAccommodation?.name || t.selectResidence}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0 hidden md:block" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-60 bg-[var(--card-bg,var(--surface))] rounded-xl shadow-xl border border-[var(--border)] overflow-hidden z-50 animate-dropdown-in p-2">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
            {t.switchResidence}
          </p>
          <div className="space-y-0.5">
            {accommodations.map((acc) => {
              const isActive = acc.id === activeAccommodationId;
              return (
                <button
                  key={acc.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveAccommodationId(acc.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                    isActive
                      ? "bg-[var(--primary-muted)] text-[var(--primary-color,#0C1C33)] font-semibold"
                      : "text-[var(--foreground)] hover:bg-[var(--muted-hover)]"
                  }`}
                >
                  <span className="flex-1 text-left truncate">{acc.name}</span>
                  {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({ title, subtitle, onMenuClick, userName, userRole, userEmail, avatarUrl, companyName, plan, scrolled = false }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { lang } = useLanguage();
  const t = translations[lang].header;
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ideaModalOpen, setIdeaModalOpen] = useState(false);
  const [ideaCategory, setIdeaCategory] = useState<FeatureRequestCategory>("new_feature");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const planLabel = getPlanLabel(plan || "free");
  const { activeAccommodation } = useAccommodation();

  const loadNotifications = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: userData } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

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
        link: n.link,
      }));
      setNotifications(formatted);
    } catch {
      // Erreur silencieuse
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Temps réel : la cloche se met à jour dès qu'une notification arrive
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `tenant_id=eq.${tenantId}` },
        () => loadNotifications()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, loadNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
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

  async function handleNotifClick(notif: NotificationItem) {
    if (!notif.isRead) {
      try {
        const supabase = createClient();
        await supabase
          .from("notifications")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("id", notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
        );
      } catch {
        // La navigation reste possible même si le marquage échoue
      }
    }
    if (notif.link) {
      setNotifOpen(false);
      router.push(notif.link);
    }
  }

  async function handleMarkAllRead() {
    if (!tenantId || unreadCount === 0) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
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
      // Redirection intelligente selon le rôle :
      // Employés (Réceptionniste/Ménagère) → Page Spéciale Employés
      // Administrateur → Portail Général
      const isEmployee = userRole === "receptionniste" || userRole === "menagere";
      window.location.href = isEmployee ? EMPLOYEE_LOGIN_ROUTE : LOGIN_ROUTE;
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
    <>
      <header
        className={`border-b border-[var(--border)] transition-shadow duration-300 ${
          scrolled
            ? "bg-[var(--main-bg,var(--background))] shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
            : "bg-[var(--main-bg,var(--background))]/90 backdrop-blur-md"
        }`}
      >
      <div className="flex items-center justify-between px-4 py-2.5">
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
            <h1 className="text-lg font-bold text-[var(--foreground)]">{title}</h1>
            {subtitle && (
              <p className="text-xs font-medium text-[var(--muted-foreground)] mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)] transition-colors w-9 lg:w-56"
            aria-label={t.searchPlaceholder}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs flex-1 text-left hidden lg:inline">{t.searchPlaceholder}</span>
            <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)]">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </button>
          </div>

          <ResidenceSwitcher />

          <div className="relative" ref={helpRef}>
            <button
              onClick={() => setHelpOpen(!helpOpen)}
              className="p-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)] transition-colors"
              aria-label="Aide & support"
              title="Aide & support"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {helpOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-[var(--card-bg,var(--surface))] rounded-xl shadow-xl border border-[var(--border)] overflow-hidden z-50 animate-dropdown-in p-1.5">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  Aide &amp; Support
                </p>
                <button
                  onClick={() => { setHelpOpen(false); setIdeaCategory("bug_report"); setIdeaModalOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                >
                  <Bug className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  Signaler un problème
                </button>
                <button
                  onClick={() => { setHelpOpen(false); setIdeaCategory("new_feature"); setIdeaModalOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  Suggérer une fonctionnalité
                </button>
              </div>
            )}
          </div>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)] transition-colors"
            aria-label={t.themeToggle}
          >
            {theme === "light" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4 text-yellow-400" />
            )}
          </button>

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
            className="p-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)] transition-colors relative"
            aria-label={t.notifications}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-[var(--card-bg,var(--surface))] rounded-xl shadow-xl border border-[var(--border)] overflow-hidden animate-fade-in">
                <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-[var(--foreground)]">{t.notifications}</h3>
                  {unreadCount > 0 && (
                    <span className="text-[11px] text-[var(--primary-color,#0C1C33)] font-medium">
                      {unreadCount} {t.unread}
                    </span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-[var(--muted-foreground)] text-xs">
                      {t.noNotifications}
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotifClick(notif)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleNotifClick(notif);
                          }
                        }}
                        className={`p-3 border-b border-[var(--border)] hover:bg-[var(--muted-hover)] transition-colors cursor-pointer ${
                          !notif.isRead ? "bg-[var(--muted)]" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${notifColors[notif.type]}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs ${notif.isRead ? "font-medium text-[var(--foreground)]" : "font-bold text-[var(--foreground)]"}`}>
                              {notif.title}
                            </p>
                            <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                              {notif.message}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{notif.time}</p>
                            {notif.link && (
                              <p className="text-[10px] font-medium text-[var(--primary-color,#0C1C33)] mt-1">
                                {t.view}
                              </p>
                            )}
                          </div>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-2 border-t border-[var(--border)]">
                  <button
                    onClick={handleMarkAllRead}
                    disabled={unreadCount === 0}
                    className="w-full text-center text-[11px] text-[var(--primary-color,#0C1C33)] hover:underline font-medium disabled:opacity-50 disabled:no-underline"
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
              className="relative w-8 h-8 rounded-full hover:ring-2 hover:ring-[var(--primary-color,#0C1C33)] ring-offset-2 ring-offset-[var(--main-bg,var(--background))] transition-all focus:outline-none focus-visible:ring-2"
              aria-label={t.profile}
              title={userName || "Profil"}
            >
              <UserAvatar name={userName} src={avatarUrl} className="w-8 h-8" />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-[var(--main-bg,var(--background))]" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-[var(--card-bg,var(--surface))] rounded-xl shadow-xl border border-[var(--border)] overflow-hidden z-50 animate-dropdown-in">
                {/* Section 1 : Infos utilisateur & rôle */}
                <div className="p-3">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar name={userName} src={avatarUrl} className="w-10 h-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--foreground)] truncate">{userName || "Utilisateur"}</p>
                      <p className="text-sm text-[var(--muted-foreground)] truncate">{userEmail || "—"}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[var(--primary-color,#0C1C33)] text-white text-[10px] font-semibold">
                      {ROLE_LABELS[userRole || ""] || userRole?.replace("_", " ").toUpperCase() || "MEMBRE"}
                    </span>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                    <Building2 className="w-3.5 h-3.5 text-[var(--primary-color,#0C1C33)] flex-shrink-0" />
                    {t.activeResidence} :{" "}
                    <span className="font-semibold text-[var(--foreground)] truncate">
                      {activeAccommodation?.name || companyName || "—"}
                    </span>
                  </p>
                </div>

                {/* Section 2 : Plan actuel + liens Paramètres / Abonnement */}
                <div className="border-t border-[var(--border)] p-2.5 space-y-1">
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[var(--muted)]">
                    <div className="w-7 h-7 rounded-md bg-[var(--primary-color,#0C1C33)] flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[var(--muted-foreground)]">{t.currentPlan}</p>
                      <p className="text-xs font-semibold text-[var(--foreground)] capitalize">{planLabel}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setProfileOpen(false); router.push("/dashboard/settings"); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                    {t.settings}
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); router.push("/dashboard/subscription"); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                    {t.subscription}
                  </button>
                </div>

                {/* Section 3 : Déconnexion */}
                <div className="border-t border-[var(--border)] p-1.5">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t.logout}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Command Palette */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 sm:px-0">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <div className="relative w-full max-w-lg bg-[var(--card-bg,var(--surface))] rounded-xl shadow-2xl overflow-hidden border border-[var(--border)] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center px-3 py-2.5 border-b border-[var(--border)]">
              <Search className="w-4 h-4 text-[var(--muted-foreground)] mr-2.5 flex-shrink-0" />
              <input
                type="text"
                className="flex-1 bg-transparent border-0 focus:ring-0 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] text-sm outline-none"
                placeholder={t.searchPlaceholder}
                autoFocus
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)] ml-2.5">
                <span className="text-[10px]">⌘</span>K
              </kbd>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">{t.commandPalette}</div>
              <button onClick={() => { router.push("/dashboard/bookings"); setSearchOpen(false); }} className="w-full flex items-center px-2.5 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--muted-hover)] rounded-lg transition-colors">
                {t.goToBookings}
              </button>
              <button onClick={() => { router.push("/dashboard/residences"); setSearchOpen(false); }} className="w-full flex items-center px-2.5 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--muted-hover)] rounded-lg transition-colors">
                {t.goToResidences}
              </button>
              <button onClick={() => { router.push("/dashboard/accounting"); setSearchOpen(false); }} className="w-full flex items-center px-2.5 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--muted-hover)] rounded-lg transition-colors">
                {t.goToAccounting}
              </button>
            </div>
          </div>
        </div>
      )}
      </header>

      {ideaModalOpen && <IdeaSubmissionModal open onClose={() => setIdeaModalOpen(false)} initialCategory={ideaCategory} />}
    </>
  );
}
