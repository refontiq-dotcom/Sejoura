import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_HUB_ROUTE, ADMIN_LOGIN_ROUTE } from "@/lib/routes";
import { loginRateLimiter, getRateLimitKey } from "@/lib/rate-limit";

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

export async function POST(req: Request) {
  const rl = await loginRateLimiter.check(getRateLimitKey(req, "admin-login"));
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429 }
    );
  }

  try {
    let password: string | undefined;
    try {
      const body = await req.json();
      password = body?.password;
    } catch {
      return NextResponse.json({ error: "Body JSON invalide." }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
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
      return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    }

    // ── Deep-link : retour vers la section demandée (ex. /admin/ideas) ─────
    // Avant : next.startsWith(ADMIN_LOGIN_ROUTE) && next.startsWith("/admin/")
    //         always true car ADMIN_LOGIN_ROUTE = "/admin" → condition redondante.
    let redirectTo = ADMIN_HUB_ROUTE;
    const url = new URL(req.url);
    const next = url.searchParams.get("next");
    if (next && next.startsWith("/admin/") && next !== ADMIN_LOGIN_ROUTE) {
      redirectTo = next;
    }

    return NextResponse.json({ success: true, redirectTo });
  } catch (err) {
    console.error("admin-login:", err);
    return NextResponse.json({ error: "Erreur serveur 🖥️. Réessayez." }, { status: 500 });
  }
}
