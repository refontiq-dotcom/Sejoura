import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_HUB_ROUTE, ADMIN_LOGIN_ROUTE } from "@/lib/routes";

// ============================================================================
// POST /api/admin-login
//
// Connexion du Super Admin avec un simple mot de passe (comme les employés).
// L'adresse e-mail du compte Super Admin est résolue côté serveur :
//   1. variable d'environnement SUPER_ADMIN_EMAIL (si définie) ;
//   2. sinon, premier compte `users.role = 'super_admin'` de la base.
//
// L'authentification se fait via Supabase Auth (email + mot de passe). La
// session est posée sur les cookies par le client serveur. Aucune adresse
// e-mail n'est demandée à l'utilisateur : la page /admin n'affiche qu'un
// champ « Mot de passe », exactement comme le portail employé.
// ============================================================================

// Rate limiting en mémoire (simple, par IP) pour limiter le brute-force.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 6;
const attemptsByIp = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry) return false;
  if (now > entry.resetAt) {
    attemptsByIp.delete(ip);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX_ATTEMPTS;
}

function recordAttempt(ip: string, success: boolean) {
  const now = Date.now();
  if (success) {
    attemptsByIp.delete(ip);
    return;
  }
  const entry = attemptsByIp.get(ip);
  if (!entry || now > entry.resetAt) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429 }
    );
  }

  try {
    const { password } = (await req.json()) as { password?: string };
    if (!password || typeof password !== "string" || password.length < 6) {
      recordAttempt(ip, false);
      return NextResponse.json({ error: "Mot de passe invalide." }, { status: 400 });
    }

    // ── Résolution de l'adresse e-mail du Super Admin ──────────────────────
    const envEmail = process.env.SUPER_ADMIN_EMAIL?.trim();
    let email = envEmail || "";

    if (!email) {
      const admin = createAdminClient();
      const { data: superAdmin } = await admin
        .from("users")
        .select("email")
        .eq("role", "super_admin")
        .not("email", "is", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (superAdmin?.email) {
        email = superAdmin.email;
      }
    }

    if (!email) {
      recordAttempt(ip, false);
      console.error("admin-login: aucun compte Super Admin (email) trouvé.");
      return NextResponse.json(
        { error: "Aucun compte Super Admin configuré." },
        { status: 500 }
      );
    }

    // ── Authentification Supabase Auth ──────────────────────────────────────
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.session) {
      recordAttempt(ip, false);
      return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
    }

    // Sécurité : vérifier que l'utilisateur connecté est bien super_admin.
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("role, is_active")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (!profile || profile.role !== "super_admin" || profile.is_active === false) {
      await supabase.auth.signOut();
      recordAttempt(ip, false);
      return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    }

    recordAttempt(ip, true);

    // ── Deep-link : retour vers la section demandée (ex. /admin/ideas) ─────
    let redirectTo = ADMIN_HUB_ROUTE;
    const url = new URL(req.url);
    const next = url.searchParams.get("next");
    if (next && next.startsWith(ADMIN_LOGIN_ROUTE) && next.startsWith("/admin/")) {
      redirectTo = next;
    }

    return NextResponse.json({ success: true, redirectTo });
  } catch (err) {
    recordAttempt(ip, false);
    console.error("admin-login:", err);
    return NextResponse.json({ error: "Erreur serveur. Réessayez." }, { status: 500 });
  }
}
