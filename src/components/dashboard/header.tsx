"use client";

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { Bell, Moon, Sun, Search, Menu, Sparkles, LogOut, Settings, CreditCard, Building2, ChevronDown, Check, HelpCircle, Bug, Wand2, MoreVertical } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import { useNotifications, type NotificationItem } from "@/contexts/notifications-context";
import { translations, type Lang } from "@/lib/translations";
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

const ROLE_LABELS = (lang: string): Record<string, string> => (translations[lang as Lang] ?? translations.fr).header.roleLabels as Record<string, string>;

const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-sky-600",
];

// Constante hoisted : évite de recréer le record à chaque render (était
// précédemment alloué dans le body de la fonction Header).
const NOTIF_COLORS: Record<string, string> = {
  info: "bg-blue-500",
  warning: "bg-orange-500",
  success: "bg-green-500",
  error: "bg-red-500",
};

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

function HeaderImpl({ title, subtitle, onMenuClick, userName, userRole, userEmail, avatarUrl, companyName, plan, scrolled = false }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { lang } = useLanguage();
  const t = translations[lang].header;
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ideaModalOpen, setIdeaModalOpen] = useState(false);
  const [ideaCategory, setIdeaCategory] = useState<FeatureRequestCategory>("new_feature");
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const planLabel = getPlanLabel(plan || "free");
  const isAdminRole = userRole === "admin_residence" || userRole === "super_admin";
  const { activeAccommodation } = useAccommodation();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

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
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
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

  // Callbacks stables : avant, ces handlers étaient recréés à chaque render
  // et passés en `onClick` à chaque ligne de notification, ce qui forçait
  // React à re-monter ces éléments à chaque update.
  const handleNotifClick = useCallback(
    async (notif: NotificationItem) => {
      if (!notif.isRead) {
        await markAsRead(notif.id);
      }
      if (notif.link) {
        setNotifOpen(false);
        router.push(notif.link);
      } else {
        setNotifOpen(false);
      }
    },
    [markAsRead, router]
  );

  const handleMarkAllRead = useCallback(async () => {
    await markAllAsRead();
    toast.success(t.markAllReadSuccess);
  }, [markAllAsRead, t.markAllReadSuccess]);

  const handleLogout = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      const isEmployee = userRole === "receptionniste" || userRole === "menagere";
      window.location.href = isEmployee ? EMPLOYEE_LOGIN_ROUTE : LOGIN_ROUTE;
    } catch {
      toast.error(t.logoutError);
    }
  }, [userRole, t.logoutError]);

  // Regroupement des notifications mémoïsé : auparavant recalculé à chaque
  // render (création de Date, comparaison de labels) même quand le dropdown
  // était fermé. Maintenant seules les dépendances pertinentes déclenchent
  // le recalcul.
  const groupedNotifications = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { label: string; items: NotificationItem[] }[] = [];
    let currentGroup = { label: "", items: [] as NotificationItem[] };

    for (const notif of notifications) {
      const notifDate = new Date(notif.time);
      notifDate.setHours(0, 0, 0, 0);

      let label = "";
      if (notifDate.getTime() === today.getTime()) {
        label = lang === "fr" ? "Aujourd'hui" : "Today";
      } else if (notifDate.getTime() === yesterday.getTime()) {
        label = lang === "fr" ? "Hier" : "Yesterday";
      } else {
        label = lang === "fr" ? "Plus tôt" : "Earlier";
      }

      if (label !== currentGroup.label) {
        if (currentGroup.items.length > 0) groups.push(currentGroup);
        currentGroup = { label, items: [] };
      }
      currentGroup.items.push(notif);
    }
    if (currentGroup.items.length > 0) groups.push(currentGroup);
    return groups;
  }, [notifications, lang]);

  return (
    <>
      <header
        className={`border-b border-[var(--border)] transition-shadow duration-300 ${
          scrolled
            ? "bg-[var(--main-bg,var(--background))] shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
            : "bg-[var(--main-bg,var(--background))]/90 backdrop-blur-md"
        }`}
      >
      <div className="flex items-center justify-between px-3 md:px-4 py-2.5 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted-hover)]"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 suppressHydrationWarning className="text-base md:text-lg font-bold text-[var(--foreground)] truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs font-medium text-[var(--muted-foreground)] mt-0.5 truncate hidden sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3.5 flex-shrink-0">
          {/* Menu trois points — visible uniquement sur mobile, contient Search + Help + Theme */}
          <div className="relative sm:hidden" ref={moreMenuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 rounded-full bg-[var(--muted)]/70 hover:bg-[var(--muted)] border border-[var(--border)]/60 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all shadow-xs"
              aria-label="Plus d'actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-[var(--card-bg,var(--surface))] rounded-xl shadow-xl border border-[var(--border)] overflow-hidden z-50 animate-dropdown-in p-1.5">
                <button
                  onClick={() => { setMenuOpen(false); setSearchOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                >
                  <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  {t.searchPlaceholder}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setHelpOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  {t.helpTitle}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); toggleTheme(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                >
                  {theme === "light" ? <Moon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> : <Sun className="w-3.5 h-3.5 text-yellow-400" />}
                  {t.themeToggle}
                </button>
              </div>
            )}
          </div>

          {/* Search — visible uniquement sur sm+ */}
          <div className="relative hidden sm:block">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center lg:justify-start gap-2 px-2.5 lg:px-3 h-9 rounded-full bg-[var(--muted)]/70 hover:bg-[var(--muted)] border border-[var(--border)]/60 text-[var(--muted-foreground)] transition-all shadow-xs w-9 lg:w-56"
            aria-label={t.searchPlaceholder}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-xs flex-1 text-left hidden lg:inline">{t.searchPlaceholder}</span>
            <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--muted)] text-[10px] font-medium text-[var(--muted-foreground)]">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </button>
          </div>

          {isAdminRole && <ResidenceSwitcher />}

          {/* Help — visible uniquement sur sm+ */}
          <div className="relative hidden sm:block" ref={helpRef}>
            <button
              onClick={() => setHelpOpen(!helpOpen)}
              className="w-9 h-9 rounded-full bg-[var(--muted)]/70 hover:bg-[var(--muted)] border border-[var(--border)]/60 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all shadow-xs"
               aria-label={t.helpTitle}
               title={t.helpTitle}
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {helpOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-[var(--card-bg,var(--surface))] rounded-xl shadow-xl border border-[var(--border)] overflow-hidden z-50 animate-dropdown-in p-1.5">
                 <p className="px-3 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                   {t.helpTitle}
                 </p>
                <button
                  onClick={() => { setHelpOpen(false); setIdeaCategory("bug_report"); setIdeaModalOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                >
                   <Bug className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                   {t.reportProblem}
                 </button>
                <button
                  onClick={() => { setHelpOpen(false); setIdeaCategory("new_feature"); setIdeaModalOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted-hover)] transition-colors"
                >
                   <Wand2 className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                   {t.suggestFeature}
                 </button>
              </div>
            )}
          </div>

          {/* Theme toggle — visible uniquement sur sm+ */}
          <button
            onClick={toggleTheme}
            className="hidden sm:flex w-9 h-9 rounded-full bg-[var(--muted)]/70 hover:bg-[var(--muted)] border border-[var(--border)]/60 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all shadow-xs"
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
              className="w-9 h-9 rounded-full bg-[var(--muted)]/70 hover:bg-[var(--muted)] border border-[var(--border)]/60 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all shadow-xs relative"
              aria-label={t.notifications}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-1.5 w-[calc(100vw-2rem)] sm:w-72 max-w-72 bg-[var(--card-bg,var(--surface))] rounded-xl shadow-xl border border-[var(--border)] overflow-hidden animate-fade-in">
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
                    groupedNotifications.map((group) => (
                      <div key={group.label}>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider bg-[var(--muted)]/50">
                          {group.label}
                        </div>
                        {group.items.map((notif) => (
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
                              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${NOTIF_COLORS[notif.type]}`} />
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
                        ))}
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

          <div className="relative flex-shrink-0" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="relative w-9 h-9 rounded-full hover:ring-2 hover:ring-[var(--primary-color,#0C1C33)] ring-offset-2 ring-offset-[var(--main-bg,var(--background))] transition-all focus:outline-none focus-visible:ring-2 flex-shrink-0"
              aria-label={t.profile}
              title={userName || "Profil"}
            >
              <UserAvatar name={userName} src={avatarUrl} className="w-9 h-9" />
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
                      {ROLE_LABELS(lang)[userRole || ""] || userRole?.replace("_", " ").toUpperCase() || "MEMBRE"}
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

                {/* Section 2 : Plan actuel + liens Paramètres / Abonnement
                    (réservée à l'administrateur — les employés ne doivent pas
                    voir l'abonnement) */}
                {isAdminRole && (
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
                )}

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
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setSearchOpen(false)} />
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

// `React.memo` : combiné aux `useCallback` du layout, le Header ne re-render
// plus à chaque update de scroll/timer du parent. La comparaison shallow
// détecte les changements réels (title, subtitle, scrolled, etc.) et court-
// circuite les re-renders inutiles (changements d'état internes au Sidebar,
// scroll, interval 5 min, etc.).
export const Header = memo(HeaderImpl);
