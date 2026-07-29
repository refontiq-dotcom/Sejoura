"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BedDouble,
  CalendarCheck,
  Sparkles,
  Wallet,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  badge?: string;
}

const navItems: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
  { label: "Résidences", href: "/dashboard/residences", icon: Building2, roles: ["admin_residence"] },
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
  plan: string;
}

export function Sidebar({ userRole, userName, companyName, plan }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const filteredItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

  return (
    <aside
      className={`${
        collapsed ? "w-20" : "w-64"
      } flex flex-col bg-[#1e1b4b] dark:bg-[#0f0a2e] text-indigo-100 transition-all duration-300 fixed inset-y-0 left-0 z-40`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-6 border-b border-indigo-800/50">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-6 h-6 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold text-white whitespace-nowrap">Séjoura</h1>
            <p className="text-xs text-indigo-300 whitespace-nowrap truncate">{companyName}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative group ${
                isActive
                  ? "bg-indigo-600 text-white shadow-lg sidebar-active-item"
                  : "text-indigo-200 hover:bg-indigo-800/50 hover:text-white"
              } ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              {item.badge && !collapsed && (
                <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-purple-500 text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Plan badge */}
      {!collapsed && (
        <div className="p-4 border-t border-indigo-800/50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-800/30">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-indigo-300">Plan actuel</p>
              <p className="text-sm font-semibold text-white capitalize">{plan}</p>
            </div>
          </div>
        </div>
      )}

      {/* User info & logout */}
      <div className="p-4 border-t border-indigo-800/50">
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white font-semibold flex-shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-indigo-300 capitalize">{userRole.replace("_", " ")}</p>
            </div>
          )}
          {!collapsed && (
            <button
              className="p-2 rounded-lg text-indigo-300 hover:bg-indigo-800/50 hover:text-white transition-colors"
              title="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-1/2 -right-3 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors"
        aria-label={collapsed ? "Déplier" : "Replier"}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}