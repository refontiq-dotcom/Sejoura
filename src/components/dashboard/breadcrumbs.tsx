"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";

export function Breadcrumbs() {
  const { lang } = useLanguage();
  const t = translations[lang].breadcrumbs;
  const pathname = usePathname();
  
  if (!pathname || pathname === "/dashboard") return null;

  const paths = pathname.split("/").filter(Boolean);
  
  const pathNames: Record<string, string> = {
    dashboard: t.dashboard,
    residences: t.residences,
    rooms: t.rooms,
    bookings: t.bookings,
    cleaning: t.cleaning,
    accounting: t.accounting,
    employees: t.employees,
    settings: t.settings,
    subscription: t.subscription,
  };

  return (
    <nav className="flex items-center text-sm text-slate-500 dark:text-slate-400 py-2.5 px-6 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 backdrop-blur-sm sticky top-[73px] z-20" aria-label={t.ariaLabel}>
      <ol className="flex items-center space-x-2">
        <li>
          <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center">
            <Home className="w-4 h-4" />
          </Link>
        </li>
        {paths.map((path, index) => {
          if (path === "dashboard") return null;
          const isLast = index === paths.length - 1;
          const href = `/${paths.slice(0, index + 1).join("/")}`;
          
          const isId = path.length > 20 && path.includes("-");
          const label = isId ? t.details : pathNames[path] || path;

          return (
            <li key={path} className="flex items-center space-x-2">
              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {isLast ? (
                <span className="font-medium text-slate-900 dark:text-white truncate max-w-[200px]" aria-current="page">
                  {label}
                </span>
              ) : (
                <Link href={href} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate max-w-[150px]">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
