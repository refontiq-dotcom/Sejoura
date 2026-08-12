import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase avec la clé service_role (bypass RLS)
 * À utiliser UNIQUEMENT côté serveur pour les opérations administratives
 * (webhooks, cron jobs, opérations système)
 *
 * ATTENTION: Ne jamais importer ce client dans un Client Component
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase serveur incomplète : " +
        "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis " +
        "pour createAdminClient()."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}