import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let schoolyAdminDb: SupabaseClient | null = null;

/**
 * Creates the Schooly admin client lazily.
 *
 * Do not instantiate this client at module evaluation time: Next.js evaluates
 * API route modules during `next build`, while the optional Schooly database
 * credentials may only exist in the Vercel runtime environment.
 */
export function getSchoolyAdminDb(): SupabaseClient {
  if (schoolyAdminDb) return schoolyAdminDb;

  const url = process.env.SCHOOLY_SUPABASE_URL;
  const serviceRoleKey = process.env.SCHOOLY_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Schooly admin Supabase is not configured. Set SCHOOLY_SUPABASE_URL and SCHOOLY_SUPABASE_SERVICE_ROLE_KEY in the server environment.'
    );
  }

  schoolyAdminDb = createClient(url, serviceRoleKey);
  return schoolyAdminDb;
}
