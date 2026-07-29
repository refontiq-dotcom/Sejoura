import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase avec la clé service_role (bypass RLS)
 * À utiliser UNIQUEMENT côté serveur pour les opérations administratives
 * (webhooks, cron jobs, opérations système)
 *
 * ATTENTION: Ne jamais importer ce client dans un Client Component
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}