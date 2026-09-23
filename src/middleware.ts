import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseUrl, getSupabasePublicKey } from "@/lib/supabase/env";

const ADMIN_ONLY_ROUTES = [
  "/dashboard/accounting",
  "/dashboard/employees",
  "/dashboard/subscription",
  "/dashboard/residences",
];

const EMPLOYEE_ALLOWED_ROUTES = [
  "/dashboard",
  "/dashboard/bookings",
  "/dashboard/cleaning",
  "/dashboard/shift",
  "/dashboard/residences/",
  "/dashboard/rooms",
  "/dashboard/settings",
];

function isAdminOnlyRoute(pathname: string): boolean {
  if (pathname === "/dashboard/residences") return true;
  return ADMIN_ONLY_ROUTES.some(
    (route) => route !== "/dashboard/residences" && pathname.startsWith(route)
  );
}

function isEmployeeAllowedRoute(pathname: string): boolean {
  if (pathname === "/dashboard" || pathname === "/dashboard/") return true;
  return EMPLOYEE_ALLOWED_ROUTES.some(
    (route) => route !== "/dashboard" && pathname.startsWith(route)
  );
}

export async function middleware(req: NextRequest) {
  const supabaseResponse = NextResponse.next({ request: req });
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublicKey();

  if (!supabaseUrl || !supabaseKey) {
    const pathname = req.nextUrl.pathname;
    if (pathname === "/") return supabaseResponse;
    return NextResponse.redirect(new URL("/", req.url));
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name) {
        return req.cookies.get(name)?.value;
      },
      set(name, value, options) {
        supabaseResponse.cookies.set({ name, value, ...options });
      },
      remove(name, options) {
        supabaseResponse.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;

  // CSRF defense-in-depth: for browser-originated state-changing requests,
  // require an Origin/Referer matching the current host. Webhooks/cron use
  // server-to-server authentication and are intentionally exempt.
  const unsafeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const csrfExempt =
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/v1/cron/");
  if (unsafeMethod && pathname.startsWith("/api/") && !csrfExempt) {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const requestOrigin = new URL(req.url).origin;
    const suppliedOrigin = origin || (referer ? new URL(referer).origin : null);
    if (suppliedOrigin && suppliedOrigin !== requestOrigin) {
      return NextResponse.json({ error: "Origine de requête refusée." }, { status: 403 });
    }
  }

  const isRoot = pathname === "/";
  const isDashboard = pathname.startsWith("/dashboard");
  const isMenage = pathname.startsWith("/menage");

  if (!user) {
    if (isDashboard) return NextResponse.redirect(new URL("/", req.url));
    if (isMenage) return NextResponse.redirect(new URL("/employee-login", req.url));
    return supabaseResponse;
  }

  // Ne jamais utiliser user_metadata pour l'autorisation : ces données sont modifiables
  // par l'utilisateur. Le rôle autorisé vient de la base via un SECURITY DEFINER
  // strictement lié à auth.uid().
  const { data: dbRole } = await supabase.rpc("get_current_user_role");
  const role = dbRole as string | null;

  // Le Super Admin global appartient exclusivement à Refontiq Control Center.
  // Les anciens comptes super_admin Séjoura sont donc privés de tout accès applicatif.
  if (role === "super_admin") {
    return NextResponse.redirect(new URL("/?error=central-admin", req.url));
  }

  const isEmployee = role === "receptionniste" || role === "menagere";

  if (isEmployee && isAdminOnlyRoute(pathname)) {
    const target = role === "menagere" ? "/menage" : "/dashboard";
    if (pathname !== target) return NextResponse.redirect(new URL(target, req.url));
  }

  if (role === "menagere" && isDashboard && pathname !== "/menage") {
    return NextResponse.redirect(new URL("/menage", req.url));
  }

  if (role === "receptionniste" && isDashboard && !isEmployeeAllowedRoute(pathname)) {
    if (pathname !== "/dashboard") return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isRoot) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/menage/:path*", "/menage", "/", "/api/:path*"],
};
