"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CalendarCheck,
  Sparkles,
  Wallet,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BedDouble,
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import { getRoleLabel } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  badge?: string;
}

const navItems: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
  { label: "Établissements", href: "/dashboard/residences", icon: Building2, roles: ["admin_residence"] },
  { label: "Chambres", href: "/dashboard/rooms", icon: BedDouble, roles: ["admin_residence", "receptionniste"] },
  { label: "Réservations", href: "/dashboard/bookings", icon: CalendarCheck, roles: ["admin_residence", "receptionniste"] },
  { label: "Ménage", href: "/dashboard/cleaning", icon: Sparkles, roles: ["admin_residence", "receptionniste"] },
  { label: "Comptabilité", href: "/dashboard/accounting", icon: Wallet, roles: ["admin_residence"] },
  { label: "Employés", href: "/dashboard/employees", icon: Users, roles: ["admin_residence"] },
  { label: "Paramètres", href: "/dashboard/settings", icon: Settings, roles: ["admin_residence"] },
];

interface SidebarProps {
  userRole: string;
  userName: string;
  companyName: string;
  collapsed?: boolean;
  onToggle?: () => void;
  onCloseMobile?: () => void;
}

export function Sidebar({ userRole, userName, companyName, collapsed = false, onToggle, onCloseMobile }: SidebarProps) {
  const { lang } = useLanguage();
  const t = translations[lang].sidebar;
  const navLabels = Object.fromEntries(t.navItems.map((item) => [item.href, item.label]));
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const isCollapsed = collapsed;
  const toggleCollapsed = () => {
    if (onToggle) onToggle();
  };

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success("Vous êtes déconnecté.");
      router.push("/login");
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
        className={`flex flex-col bg-blue-600 dark:bg-blue-800 text-white transition-all duration-300 fixed inset-y-0 left-0 z-50 shadow-xl overflow-visible ${
          isCollapsed ? "-translate-x-full lg:translate-x-0 lg:w-20" : "translate-x-0 w-64"
        }}`}
      >

      {/* Logo */}
      <div className="flex items-center gap-3 p-6 border-b border-blue-500/50">
        <div className="w-10 h-10 rounded-xl bg-[var(--card)] flex items-center justify-center flex-shrink-0 overflow-hidden">
          <Image src="/logo.png" alt="Séjoura by Refontiq" width={40} height={40} />
        </div>
        {!isCollapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold text-white whitespace-nowrap">Séjoura by Refontiq</h1>
            <p className="text-xs text-blue-100 whitespace-nowrap truncate">{companyName}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 relative">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 py-3 transition-all relative ${
                isActive
                  ? "bg-[var(--muted)] dark:bg-slate-900 text-blue-700 dark:text-blue-400 rounded-l-2xl rounded-r-none -mr-4 pr-4 pl-5 z-20 shadow-[-4px_0_12px_rgba(0,0,0,0.03)] dark:shadow-[-4px_0_12px_rgba(255,255,255,0.05)]"
                  : "text-blue-50 hover:bg-blue-700/60 hover:text-white rounded-xl mx-3 px-5"
              } ${isCollapsed ? "justify-center !px-0 !mx-2 w-auto rounded-xl bg-blue-700 text-white" : ""}`}
              title={isCollapsed ? item.label : undefined}
            >
              {/* Optional SaaS fluid corners using pseudo-elements when active and not collapsed */}
              {isActive && !isCollapsed && (
                <>
                  <div className="absolute -top-4 right-0 w-4 h-4 bg-transparent rounded-br-2xl pointer-events-none" style={{ boxShadow: "4px 4px 0 4px var(--background)" }} />
                  <div className="absolute -bottom-4 right-0 w-4 h-4 bg-transparent rounded-tr-2xl pointer-events-none" style={{ boxShadow: "4px -4px 0 4px var(--background)" }} />
                </>
              )}
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="text-sm font-medium">{navLabels[item.href] || item.label}</span>}
              {item.badge && !isCollapsed && (
                <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-blue-500 text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User info & logout */}
      <div className="p-4 border-t border-blue-500/50">
        <div className={`flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-blue-100">{getRoleLabel(userRole)}</p>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="p-2 rounded-lg text-blue-200 hover:bg-blue-700/60 hover:text-white transition-colors disabled:opacity-50"
              title={t.logoutTooltip}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapse button - Desktop only */}
      <button
        onClick={toggleCollapsed}
        className="hidden lg:flex absolute top-1/2 -right-3 w-6 h-6 rounded-full bg-blue-500 text-white items-center justify-center shadow-lg hover:bg-blue-400 transition-colors"
        aria-label={isCollapsed ? t.expand : t.collapse}
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
    </>
  );
}
