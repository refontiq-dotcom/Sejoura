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
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";
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
  { label: "Réservations", href: "/dashboard/bookings", icon: CalendarCheck, roles: ["admin_residence", "receptionniste"] },
  { label: "Ménage", href: "/dashboard/cleaning", icon: Sparkles, roles: ["receptionniste", "menagere"] },
  { label: "Mon Shift / Caisse", href: "/dashboard/shift", icon: ClipboardList, roles: ["receptionniste", "menagere"] },
  { label: "Comptabilité", href: "/dashboard/accounting", icon: Wallet, roles: ["admin_residence"] },
  { label: "Employés", href: "/dashboard/employees", icon: Users, roles: ["admin_residence"] },
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
}

export function Sidebar({ userRole, userName, companyName, companyLogo = null, themeColor = null, collapsed = false, onToggle, onCloseMobile }: SidebarProps) {
  const { lang } = useLanguage();
  const { theme } = useTheme();
  const t = translations[lang].sidebar;
  const navLabels = Object.fromEntries(t.navItems.map((item) => [item.href, item.label]));
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const themeStyles = getSidebarThemeStyles(themeColor, theme === "dark");

  const isCollapsed = collapsed;
  const toggleCollapsed = () => {
    if (onToggle) onToggle();
  };

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      const isEmployee = userRole === "receptionniste" || userRole === "menagere";
      window.location.href = isEmployee ? EMPLOYEE_LOGIN_ROUTE : LOGIN_ROUTE;
    } catch {
      toast.error("Impossible de se déconnecter.");
      setLoggingOut(false);
    }
  }

  const filteredItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className={`lg:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity ${!isCollapsed ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => onCloseMobile && onCloseMobile()}
      />
      <aside
        style={{
          backgroundColor: themeStyles.sidebarBg,
          color: themeStyles.textColor,
          "--sidebar-bg": themeStyles.sidebarBg,
          "--main-bg": themeStyles.mainBg,
        } as React.CSSProperties}
        className={`group flex flex-col transition-all duration-300 fixed inset-y-0 left-0 z-50 shadow-2xl overflow-visible ${
          isCollapsed ? "-translate-x-full lg:translate-x-0 lg:w-20" : "translate-x-0 w-60"
        }`}
      >

      {/* Logo Section */}
      <div 
        className="flex flex-col p-2.5 border-b"
        style={{ borderColor: themeStyles.borderColor }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm p-0.5">
              <AppLogo
                logoUrl={companyLogo}
                alt={companyName}
                width={24}
                height={24}
                className="object-contain"
              />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden min-w-0">
                <h1 
                  className="text-[13px] font-bold whitespace-nowrap truncate"
                  style={{ color: themeStyles.textColor }}
                >
                  {companyName}
                </h1>
                <p 
                  className="text-[9px] font-semibold tracking-wide"
                  style={{ color: themeStyles.accentColor }}
                >
                  Séjoura SaaS
                </p>
              </div>
            )}
          </div>

          {/* Integrated Header Toggle Button - Desktop */}
          <button
            onClick={toggleCollapsed}
            style={{ color: themeStyles.textColor }}
            className="hidden lg:flex p-1 rounded-md hover:bg-white/10 transition-colors shrink-0 focus:outline-none"
            aria-label={isCollapsed ? t.expand : t.collapse}
            title={isCollapsed ? t.expand : t.collapse}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-3.5 h-3.5" />
            ) : (
              <PanelLeftClose className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        {!isCollapsed && (
          <div 
            className="mt-1.5 h-[1.5px] w-full"
            style={{ backgroundColor: themeStyles.accentColor }}
          />
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-visible py-2 pl-0 pr-0 space-y-0.5 relative">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                backgroundColor: isActive ? themeStyles.mainBg : "transparent",
                color: isActive ? themeStyles.activeTextColor : themeStyles.textColor,
              }}
              className={
                isCollapsed
                  ? `flex items-center justify-center w-8 h-8 rounded-md mx-auto my-0.5 transition-all ${
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
              {item.badge && !isCollapsed && (
                <span
                  className="ml-auto px-1.5 py-px text-[10px] rounded-full font-bold"
                  style={{
                    backgroundColor: isActive ? themeStyles.sidebarBg : themeStyles.accentColor,
                    color: isActive ? themeStyles.mainBg : (themeStyles.isDark ? "#0C1C33" : "#FFFFFF"),
                  }}
                >
                  {item.badge}
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
          style={{
            backgroundColor: pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/") ? themeStyles.mainBg : "transparent",
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
