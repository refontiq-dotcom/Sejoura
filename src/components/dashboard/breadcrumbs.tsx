"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/translations";
import { createClient } from "@/lib/supabase/client";

export function Breadcrumbs() {
  const { lang } = useLanguage();
  const t = translations[lang].breadcrumbs;
  const pathname = usePathname();
  const [residenceNames, setResidenceNames] = useState<Record<string, string>>({});
  const loadedRef = useRef(false);

  const paths = pathname ? pathname.split("/").filter(Boolean) : [];

  // Chercher les IDs dans le chemin et charger les noms des résidences
  useEffect(() => {
    if (loadedRef.current) return;
    const ids = paths.filter((p) => p.length > 20 && p.includes("-"));
    if (ids.length === 0) return;
    
    loadedRef.current = true;
    async function loadNames() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("accommodations")
          .select("id, name")
          .in("id", ids);
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((acc: { id: string; name: string }) => {
            names[acc.id] = acc.name;
          });
          setResidenceNames(names);
        }
      } catch {
        // Ignorer les erreurs de chargement
      }
    }
    loadNames();
  }, [pathname, paths]);
  
  if (!pathname || pathname === "/dashboard") return null;

  const pathNames: Record<string, string> = {
    dashboard: t.dashboard,
    residences: t.residences,
    rooms: t.rooms,
    bookings: t.bookings,
    cleaning: t.cleaning,
    shift: "Mon Shift / Caisse",
    accounting: t.accounting,
    employees: t.employees,
    settings: t.settings,
    subscription: t.subscription,
    suggestions: "Suggestions",
  };

  return (
    <nav className="flex items-center text-sm text-[var(--muted-foreground)] py-2.5 px-6 bg-[var(--main-bg,var(--background))] border-b border-[var(--border)]" aria-label={t.ariaLabel}>
      <ol className="flex items-center space-x-2">
        <li>
          <Link href="/dashboard" className="hover:text-[var(--primary-color,#0C1C33)] transition-colors flex items-center">
            <Home className="w-4 h-4" />
          </Link>
        </li>
        {paths.map((path, index) => {
          if (path === "dashboard") return null;
          const isLast = index === paths.length - 1;
          const href = `/${paths.slice(0, index + 1).join("/")}`;
          
          const isId = path.length > 20 && path.includes("-");
          const label = isId
            ? (residenceNames[path] || t.details)
            : pathNames[path] || path;

          return (
            <li key={path} className="flex items-center space-x-2">
              <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)] opacity-50 flex-shrink-0" />
              {isLast ? (
                <span className="font-medium text-[var(--foreground)] truncate max-w-[200px]" aria-current="page">
                  {label}
                </span>
              ) : (
                <Link href={href} className="hover:text-[var(--primary-color,#0C1C33)] transition-colors truncate max-w-[150px]">
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
