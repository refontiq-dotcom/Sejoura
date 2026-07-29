"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Moon, Sun, Search, Menu } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "info" | "warning" | "success" | "error";
  isRead: boolean;
}

// Notifications simulées (seront remplacées par les vraies données Supabase)
const mockNotifications: NotificationItem[] = [
  {
    id: "1",
    title: "Nouvelle réservation",
    message: "Réservation SJ-2024-0001 confirmée pour la chambre 101",
    time: "Il y a 5 min",
    type: "success",
    isRead: false,
  },
  {
    id: "2",
    title: "Check-out prévu",
    message: "Départ prévu aujourd'hui à 11:00 — Chambre 204",
    time: "Il y a 30 min",
    type: "info",
    isRead: false,
  },
  {
    id: "3",
    title: "Alerte ménage",
    message: "La chambre 302 dépasse le délai de nettoyage (+1h30)",
    time: "Il y a 1h",
    type: "warning",
    isRead: true,
  },
];

export function Header({ title, subtitle, onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = mockNotifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const notifColors: Record<string, string> = {
    info: "bg-blue-500",
    warning: "bg-orange-500",
    success: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left: Title */}
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
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

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            {searchOpen ? (
              <input
                type="text"
                placeholder="Rechercher..."
                autoFocus
                onBlur={() => setSearchOpen(false)}
                className="w-64 pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Rechercher"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
            {searchOpen && (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Changer le thème"
          >
            {theme === "light" ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5 text-yellow-400" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      {unreadCount} non lues
                    </span>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {mockNotifications.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">
                      Aucune notification
                    </div>
                  ) : (
                    mockNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-4 border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer ${
                          !notif.isRead ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""
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
                  <button className="w-full text-center text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                    Marquer tout comme lu
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}