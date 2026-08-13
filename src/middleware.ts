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

  // ── Vérification temps réel de l'état du compte dans la base de données ──
  if (user) {
    const { data: dbUser } = await supabase
      .from("users")
      .select("id, is_active, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    // Compte désactivé par l'employeur : révocation immédiate
    if (dbUser && dbUser.is_active === false) {
      await supabase.auth.signOut();
      const redirectUrl = new URL("/employee-login", req.url);
      redirectUrl.searchParams.set("error", "revoked");
      return NextResponse.redirect(redirectUrl);
    }

    // Profil absent de la table `users`.
    //  - Compte employé supprimé par l'employeur → révocation immédiate.
    //  - Gérant fraîchement inscrit (étape 1 validée) : le profil n'est créé
    //    qu'à l'étape 2 (onboarding /api/register) → on laisse passer uniquement
    //    /dashboard pour qu'il puisse terminer la configuration de son espace.
    if (!dbUser) {
      const email = (user.email || "").toLowerCase();
      const metaRole = user.user_metadata?.role;
      const isEmployeeAccount =
        email.includes("@employe.sejoura.com") ||
        metaRole === "receptionniste" ||
        metaRole === "menagere";

      if (isEmployeeAccount) {
        await supabase.auth.signOut();
        const redirectUrl = new URL("/employee-login", req.url);
        redirectUrl.searchParams.set("error", "revoked");
        return NextResponse.redirect(redirectUrl);
      }

      if (isDashboard && pathname !== "/dashboard") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    const role = dbUser?.role;
    const isEmployee = role === "receptionniste" || role === "menagere";

    // Note : la détection d'un onboarding incomplet (étape 2) est désormais
    // décidée côté serveur dans l'API /api/auth/onboarding-status (service_role),
    // puis affichée par le layout du tableau de bord. Aucune redirection n'est
    // faite ici : une lecture `accommodations` bloquée par RLS ne doit jamais
    // renvoyer un compte déjà configuré vers un état d'installation.

    // ── CLOISONNEMENT DES RÔLES ──
    // Un employé ne doit JAMAIS accéder aux routes admin
    if (isEmployee && (isAdminOnlyRoute(pathname) || isAdmin)) {
      const target = role === "menagere" ? "/menage" : "/dashboard";
      if (pathname !== target) {
        return NextResponse.redirect(new URL(target, req.url));
      }
    }

    // Redirection des ménagères vers leur espace spécifique s'ils accèdent au dashboard
    if (role === "menagere" && isDashboard) {
      if (pathname !== "/menage") {
        return NextResponse.redirect(new URL("/menage", req.url));
      }
    }

    // Un réceptionniste ne peut accéder qu'aux routes autorisées dans le dashboard
    if (role === "receptionniste" && isDashboard && !isEmployeeAllowedRoute(pathname)) {
      if (pathname !== "/dashboard") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }
  }

  // Protéger les routes employeur
  if (!user && (isDashboard || isAdmin)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Protéger les routes employé (/menage)
  if (!user && isMenage) {
    return NextResponse.redirect(new URL("/employee-login", req.url));
  }

  // Rediriger la racine uniquement pour les gestionnaires (pas les employés)
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
