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
  const isRoot = pathname === "/";
  const isDashboard = pathname.startsWith("/dashboard");
  const isMenage = pathname.startsWith("/menage");

  if (!user) {
    if (isDashboard) return NextResponse.redirect(new URL("/", req.url));
    if (isMenage) return NextResponse.redirect(new URL("/employee-login", req.url));
    return supabaseResponse;
  }

  const metaRole = user.user_metadata?.role as string | undefined;

  // Le Super Admin global appartient exclusivement à Refontiq Control Center.
  // Les anciens comptes super_admin Séjoura sont donc privés de tout accès applicatif.
  if (metaRole === "super_admin") {
    return NextResponse.redirect(new URL("/?error=central-admin", req.url));
  }

  const isEmployee = metaRole === "receptionniste" || metaRole === "menagere";

  if (isEmployee && isAdminOnlyRoute(pathname)) {
    const target = metaRole === "menagere" ? "/menage" : "/dashboard";
    if (pathname !== target) return NextResponse.redirect(new URL(target, req.url));
  }

  if (metaRole === "menagere" && isDashboard && pathname !== "/menage") {
    return NextResponse.redirect(new URL("/menage", req.url));
  }

  if (metaRole === "receptionniste" && isDashboard && !isEmployeeAllowedRoute(pathname)) {
    if (pathname !== "/dashboard") return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isRoot) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/menage/:path*", "/menage", "/"],
};
