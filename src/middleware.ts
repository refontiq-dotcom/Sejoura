import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseUrl, getSupabasePublicKey } from "@/lib/supabase/env";

// Routes réservées aux Administrateurs (Employeurs)
const ADMIN_ONLY_ROUTES = [
  "/dashboard/accounting",
  "/dashboard/employees",
  "/dashboard/settings",
  "/dashboard/subscription",
  "/dashboard/residences", // Liste des résidences (le détail /dashboard/residences/[id] reste accessible aux réceptionnistes)
];

// Routes autorisées pour les Employés (Réceptionnistes) dans le dashboard
const EMPLOYEE_ALLOWED_ROUTES = [
  "/dashboard", // Tableau de bord
  "/dashboard/bookings", // Réservations
  "/dashboard/cleaning", // Ménage
  "/dashboard/shift", // Shift / Caisse
  "/dashboard/residences/", // Détail d'une résidence (avec chambres)
];

function isAdminOnlyRoute(pathname: string): boolean {
  if (pathname.startsWith("/admin")) return true;
  if (pathname === "/dashboard/residences") return true;
  return ADMIN_ONLY_ROUTES.some((route) => route !== "/dashboard/residences" && pathname.startsWith(route));
}

function isEmployeeAllowedRoute(pathname: string): boolean {
  if (pathname === "/dashboard" || pathname === "/dashboard/") return true;
  return EMPLOYEE_ALLOWED_ROUTES.some((route) => route !== "/dashboard" && pathname.startsWith(route));
}

export async function middleware(req: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request: req,
  });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value;
        },
        set(name, value, options) {
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name, options) {
          supabaseResponse.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;
  const isRoot = pathname === "/";
  const isDashboard = pathname.startsWith("/dashboard");
  const isAdmin = pathname.startsWith("/admin");
  const isMenage = pathname.startsWith("/menage");

  // ── NON CONNECTÉ : protéger les zones privées ──
  if (!user) {
    if (isDashboard || isAdmin) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (isMenage) {
      return NextResponse.redirect(new URL("/employee-login", req.url));
    }
    return supabaseResponse;
  }

  // ── CONNECTÉ : cloisonnement des rôles ──
  // Le rôle est lu dans les métadonnées du JWT (posées à l'inscription), SANS
  // aucune requête base de données. Cela supprime tout conflit de redirection
  // et tout blocage RLS au niveau du middleware. L'état complet du compte
  // (is_active, tenant, onboarding étape 2) est vérifié côté client par les
  // layouts et l'API /api/auth/onboarding-status (service_role).
  const metaRole = user.user_metadata?.role as string | undefined;
  const isEmployee = metaRole === "receptionniste" || metaRole === "menagere";

  // Un employé ne doit JAMAIS accéder aux routes admin
  if (isEmployee && (isAdminOnlyRoute(pathname) || isAdmin)) {
    const target = metaRole === "menagere" ? "/menage" : "/dashboard";
    if (pathname !== target) {
      return NextResponse.redirect(new URL(target, req.url));
    }
  }

  // Redirection des ménagères vers leur espace spécifique
  if (metaRole === "menagere" && isDashboard) {
    if (pathname !== "/menage") {
      return NextResponse.redirect(new URL("/menage", req.url));
    }
  }

  // Un réceptionniste ne peut accéder qu'aux routes autorisées dans le dashboard
  if (metaRole === "receptionniste" && isDashboard && !isEmployeeAllowedRoute(pathname)) {
    if (pathname !== "/dashboard") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // Racine : rediriger les utilisateurs connectés vers le tableau de bord.
  // Un gérant en cours d'onboarding (étape 2) est géré par le layout du
  // dashboard, pas par une redirection ici.
  if (user && isRoot) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/menage/:path*",
    "/menage",
    "/",
  ],
};
