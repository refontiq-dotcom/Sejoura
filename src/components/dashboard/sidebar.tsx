"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CalendarCheck,
  Sparkles,
  Wallet,
  Users,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardList,
  Store,
  IdCard,
  DoorOpen,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { getRoleLabel } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import { LOGIN_ROUTE, EMPLOYEE_LOGIN_ROUTE } from "@/lib/routes";

import { AppLogo } from "@/components/ui/app-logo";

import { getSidebarThemeStyles } from "@/lib/colors";
import { useTheme } from "@/components/providers/theme-provider";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { className?: string }>;
  roles?: string[];
  badge?: string;
}

const navItems: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
  { label: "Établissements", href: "/dashboard/residences", icon: Building2, roles: ["admin_residence"] },
  { label: "Chambres", href: "/dashboard/rooms", icon: DoorOpen, roles: ["admin_residence", "receptionniste"] },
  { label: "Réservations", href: "/dashboard/bookings", icon: CalendarCheck, roles: ["admin_residence", "receptionniste"] },
  { label: "Suivi ménage", href: "/dashboard/cleaning", icon: Sparkles, roles: ["admin_residence", "receptionniste"] },
  { label: "Mon Shift / Caisse", href: "/dashboard/shift", icon: ClipboardList, roles: ["receptionniste", "menagere"] },
  { label: "Comptabilité", href: "/dashboard/accounting", icon: Wallet, roles: ["admin_residence"] },
  { label: "Employés", href: "/dashboard/employees", icon: Users, roles: ["admin_residence"] },
  { label: "Dossiers RH", href: "/dashboard/hr", icon: IdCard, roles: ["admin_residence"] },
  { label: "Vitrine Trouvetou", href: "/dashboard/trouvetou", icon: Store, roles: ["admin_residence"] },
];

interface SidebarProps {
  userRole: string;
  userName: string;
  companyName: string;
  companyLogo?: string | null;
  themeColor?: string | null;
  collapsed?: boolean;
  onToggle?: () => void;
  onCloseMobile?: () => void;
  /** Couleur exacte du canvas (<main>) en mode clair : l'onglet actif utilise
   *  la MÊME valeur pour fusionner parfaitement avec le fond pastel de la page. */
  mainBg?: string;
  onlineBookingCount?: number;
}

function SidebarImpl({ userRole, userName, companyName, companyLogo = null, themeColor = null, collapsed = false, onToggle, onCloseMobile, mainBg, onlineBookingCount = 0 }: SidebarProps) {
  const { lang } = useLanguage();
  const { theme } = useTheme();
  const t = translations[lang].sidebar;
  const navLabels = useMemo(
    () => Object.fromEntries(t.navItems.map((item) => [item.href, item.label])),
    [t.navItems]
  );
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const themeStyles = useMemo(
    () => getSidebarThemeStyles(themeColor, theme === "dark"),
    [themeColor, theme]
  );
  const activeTabBg = mainBg || "var(--main-bg)";

  const isCollapsed = collapsed;
  const handleToggle = useCallback(() => onToggle?.(), [onToggle]);
  const handleCloseMobile = useCallback(() => onCloseMobile?.(), [onCloseMobile]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      const isEmployee = userRole === "receptionniste" || userRole === "menagere";
      window.location.href = isEmployee ? EMPLOYEE_LOGIN_ROUTE : LOGIN_ROUTE;
    } catch {
      toast.error("La déconnexion a échoué 🔄");
      setLoggingOut(false);
    }
  }

  const filteredItems = useMemo(
    () => navItems.filter((item) => !item.roles || item.roles.includes(userRole)),
    [userRole]
  );

  return (
    <>
      {/* Mobile overlay : sans backdrop-blur (très coûteux en repaint
          plein écran) — voile sombre + transition d'opacité. */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-slate-900/50 transition-opacity duration-200 ${
          !isCollapsed ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleCloseMobile}
      />
      <aside
        style={{
          backgroundColor: themeStyles.sidebarBg,
          color: themeStyles.textColor,
          "--sidebar-bg": themeStyles.sidebarBg,
          "--main-bg": activeTabBg,
        } as React.CSSProperties}
        className={`group flex flex-col fixed inset-y-0 left-0 z-50 shadow-2xl overflow-visible transition-transform duration-300 will-change-transform ${
          isCollapsed
            ? "-translate-x-full lg:translate-x-0 lg:w-20 w-60"
            : "translate-x-0 w-60"
        }`}
      >

      {/* Logo Section */}
      <div 
        className="flex flex-col p-3 border-b"
        style={{ borderColor: themeStyles.borderColor }}
      >
        <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? "justify-center" : "justify-between"}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`${isCollapsed ? "w-10 h-10" : "w-11 h-11"} rounded-xl bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm p-1`}>
              <AppLogo
                logoUrl={companyLogo}
                alt={companyName}
                width={36}
                height={36}
                className="object-contain"
              />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden min-w-0">
                <h1 
                  className="text-[15px] font-bold leading-tight whitespace-nowrap truncate"
                  style={{ color: themeStyles.textColor }}
                >
                  {companyName}
                </h1>
                <p 
                  className="text-[11px] font-semibold tracking-wide mt-0.5"
                  style={{ color: themeStyles.accentColor }}
                >
                  Séjoura SaaS
                </p>
              </div>
            )}
          </div>

          {/* Integrated Header Toggle Button - Desktop */}
          <button
            onClick={handleToggle}
            style={{ color: themeStyles.textColor }}
            className="hidden lg:flex p-1.5 rounded-md hover:bg-white/10 transition-colors shrink-0 focus:outline-none"
            aria-label={isCollapsed ? t.expand : t.collapse}
            title={isCollapsed ? t.expand : t.collapse}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>
        {!isCollapsed && (
          <div 
            className="mt-2 h-[2px] w-full rounded-full"
            style={{ backgroundColor: themeStyles.accentColor }}
          />
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-visible py-2 pl-0 pr-0 space-y-0.5 relative">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          const isBookings = item.href === "/dashboard/bookings";
          const badgeCount = isBookings && onlineBookingCount > 0 ? onlineBookingCount : item.badge;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleCloseMobile}
              style={{
                backgroundColor: isActive ? activeTabBg : "transparent",
                color: isActive ? themeStyles.activeTextColor : themeStyles.textColor,
              }}
              className={
                isCollapsed
                  ? `flex items-center justify-center w-8 h-8 rounded-md mx-auto my-0.5 transition-all relative ${
                      !isActive ? "hover:bg-white/10" : ""
                    }`
                  : isActive
                  ? "active-sidebar-tab flex items-center gap-2 py-1.5 px-2.5 text-[13px] font-medium transition-all"
                  : "flex items-center gap-2 py-1.5 px-2.5 ml-1.5 mr-1.5 rounded-md text-[13px] font-medium transition-all hover:bg-white/10"
              }
              title={isCollapsed ? (navLabels[item.href] || item.label) : undefined}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? themeStyles.activeTextColor : themeStyles.textColor }} />
              {!isCollapsed && (
                <span className="text-[13px] font-medium truncate" style={{ color: isActive ? themeStyles.activeTextColor : themeStyles.textColor }}>
                  {navLabels[item.href] || item.label}
                </span>
              )}
              {badgeCount && !isCollapsed && (
                <span
                  className={`ml-auto px-1.5 py-px text-[10px] rounded-full font-bold ${
                    isBookings && onlineBookingCount > 0
                      ? "bg-emerald-500 text-white"
                      : ""
                  }`}
                  style={{
                    backgroundColor: isBookings && onlineBookingCount > 0 ? undefined : (isActive ? themeStyles.sidebarBg : themeStyles.accentColor),
                    color: isBookings && onlineBookingCount > 0 ? undefined : (isActive ? "var(--main-bg)" : (themeStyles.isDark ? "#0C1C33" : "#FFFFFF")),
                  }}
                >
                  {badgeCount}
                </span>
              )}
              {isCollapsed && isBookings && onlineBookingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-[var(--sidebar-bg)]">
                  {onlineBookingCount > 99 ? "99+" : onlineBookingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        {/* Paramètres Link */}
        <Link
          href="/dashboard/settings"
          onClick={handleCloseMobile}
          style={{
            backgroundColor: pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/") ? activeTabBg : "transparent",
            color: pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/") ? themeStyles.activeTextColor : themeStyles.textColor,
          }}
          className={
            isCollapsed
              ? `flex items-center justify-center w-8 h-8 rounded-md mx-auto my-0.5 transition-all ${
                  !(pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/")) ? "hover:bg-white/10" : ""
                }`
              : (pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/"))
              ? "active-sidebar-tab flex items-center gap-2 py-1.5 px-2.5 text-[13px] font-medium transition-all"
              : "flex items-center gap-2 py-1.5 px-2.5 ml-1.5 mr-1.5 rounded-md text-[13px] font-medium transition-all hover:bg-white/10"
          }
          title={isCollapsed ? (navLabels["/dashboard/settings"] || "Paramètres") : undefined}
        >
          <Settings className="w-3.5 h-3.5 flex-shrink-0" style={{ color: (pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/")) ? themeStyles.activeTextColor : themeStyles.textColor }} />
          {!isCollapsed && (
            <span className="text-[13px] font-medium truncate" style={{ color: (pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/")) ? themeStyles.activeTextColor : themeStyles.textColor }}>
              {navLabels["/dashboard/settings"] || "Paramètres"}
            </span>
          )}
        </Link>

        {/* User info & logout */}
        <div 
        className="p-2.5 border-t"
        style={{ borderColor: themeStyles.borderColor }}
      >
        <div className={`flex items-center gap-2 ${isCollapsed ? "justify-center" : ""}`}>
          <div 
            className="w-7 h-7 rounded-full flex items-center justify-center font-bold shrink-0 shadow-sm text-[11px]"
            style={{
              backgroundColor: themeStyles.accentColor,
              color: themeStyles.isDark ? "#0C1C33" : "#FFFFFF",
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold truncate" style={{ color: themeStyles.textColor }}>{userName}</p>
              <p className="text-[9px] font-semibold" style={{ color: themeStyles.mutedTextColor }}>{getRoleLabel(userRole)}</p>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{ color: themeStyles.mutedTextColor }}
              className="p-1 rounded-md hover:opacity-75 transition-opacity disabled:opacity-50"
              title={t.logoutTooltip}
            >
              <LogOut className="w-3 h-3" />
            </button>
          )}
        </div>
       </div>
       </div>
      </aside>
    </>
  );
}

// `React.memo` court-circuite le re-render si les props sont shallow-égales.
// Combiné avec les `useCallback` du layout parent, le Sidebar ne re-render
// plus à chaque update de scroll/timer/état local du layout.
export const Sidebar = memo(SidebarImpl);
