import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase ADMIN de la base Schooly (clé service_role, bypass RLS).
 *
 * ⚠️ CRÉATION PARESSEUSE — ne jamais faire :
 *
 *   export const db = createClient(process.env.X!, process.env.Y!)
 *
 * L'évaluation du module a lieu au BUILD (Next collecte les données de chaque
 * route) : une variable d'environnement absente sur le poste de build, dans un
 * worktree, une CI ou une preview Vercel fait alors exploser le build avec
 * « supabaseUrl is required », alors que la route est parfaitement valide.
 *
 * Le client n'est donc créé qu'à la première utilisation, comme
 * `createAdminClient()` dans ./admin.ts.
 */
let cached: SupabaseClient | null = null;

export function getSchoolyAdminDb(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SCHOOLY_SUPABASE_URL;
  const serviceRoleKey = process.env.SCHOOLY_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Configuration Schooly serveur incomplète : SCHOOLY_SUPABASE_URL et " +
        "SCHOOLY_SUPABASE_SERVICE_ROLE_KEY sont requis pour getSchoolyAdminDb()."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
