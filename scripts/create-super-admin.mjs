#!/usr/bin/env node
// ============================================================================
// SÉJOURA — create-super-admin
// Crée ou met à jour le compte Super Admin (Supabase Auth + profil public).
//
// Prérequis :
//   NEXT_PUBLIC_SUPABASE_URL      → URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY     → clé service_role (SERVEUR UNIQUEMENT)
//   SUPER_ADMIN_EMAIL             → adresse e-mail du compte Super Admin
//   SUPER_ADMIN_PASSWORD          → mot de passe (min. 6 caractères)
//
// Le rôle 'super_admin' est posé dans les user_metadata au moment de la
// création du compte Auth : le trigger handle_new_user crée alors la ligne
// public.users avec role = 'super_admin' (cf. migrations). Si le compte existe
// déjà, le script met à jour ses metadata et s'assure que la ligne public.users
// porte bien le rôle.
//
// Usage :
//   source .env.local && node scripts/create-super-admin.mjs
// ============================================================================
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const email = process.env.SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!email) missing.push("SUPER_ADMIN_EMAIL");

  if (missing.length > 0) {
    console.error(
      `❌ Variables manquantes : ${missing.join(", ")}\n` +
        '   Exemple : source .env.local && node scripts/create-super-admin.mjs'
    );
    process.exit(1);
  }

  if (password && password.length < 6) {
    console.error("❌ Le mot de passe doit contenir au moins 6 caractères.");
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Récupérer (ou créer) le compte Auth ─────────────────────────────
  // getUserByEmail n'existe pas dans toutes les versions : on parcourt
  // listUsers (paginé) pour retrouver le compte par e-mail.
  async function findUserByEmail(email) {
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      const match = data.users.find(
        (u) => (u.email || "").toLowerCase() === email.toLowerCase()
      );
      if (match) return match;
      if (data.users.length < 1000 || data.nextPage === null) return null;
      page += 1;
    }
  }

  const existing = await findUserByEmail(email);

  let authUserId;
  if (existing) {
    console.log(`ℹ  Compte Auth existant : ${email}`);
    const { data, error } = await admin.auth.admin.updateUserById(
      existing.id,
      { user_metadata: { ...existing.user_metadata, role: "super_admin" } }
    );
    if (error) throw error;
    authUserId = data.user.id;
    console.log("✓ Metadata mises à jour (role = super_admin).");
  } else {
    if (!password) {
      console.error(
        "❌ SUPER_ADMIN_PASSWORD est requis pour créer le compte Auth."
      );
      process.exit(1);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "super_admin", full_name: "Super Admin" },
    });
    if (error) throw error;
    authUserId = data.user.id;
    console.log(`✓ Compte Auth créé : ${email}`);
  }

  // ── 2. S'assurer que le profil public.users porte le rôle ───────────────
  const { data: profile } = await admin
    .from("users")
    .select("id, role, is_active, email")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (profile) {
    const updates = { is_active: true };
    if (profile.role !== "super_admin") updates.role = "super_admin";
    if (Object.keys(updates).length > 0) {
      await admin.from("users").update(updates).eq("id", profile.id);
      console.log("✓ Profil public.users mis à jour (role = super_admin, is_active).");
    } else {
      console.log("✓ Profil public.users déjà correct.");
    }
  } else {
    // Le trigger handle_new_user n'a pas tourné (compte créé avant sa mise
    // en place) : on crée la ligne manuellement.
    const { error } = await admin.from("users").insert({
      auth_user_id: authUserId,
      email,
      role: "super_admin",
      full_name: "Super Admin",
      is_active: true,
      tenant_id: null,
    });
    if (error) throw error;
    console.log("✓ Profil public.users créé (role = super_admin).");
  }

  console.log("\n✅ Super Admin prêt.");
  console.log("   - Connexion : https://<domaine>/admin (mot de passe seul)");
  console.log(
    `   - Pensez à définir SUPER_ADMIN_EMAIL=${email} dans .env.local / Vercel`
  );
}

main().catch((err) => {
  console.error("❌ Échec :", err instanceof Error ? err.message : err);
  process.exit(1);
});
