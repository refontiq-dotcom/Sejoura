import { createClient } from '@supabase/supabase-js';

/**
 * Creates the Schooly admin client lazily.
 *
 * This must not run at module import time because Next.js evaluates server
 * route modules during `next build`. If the optional Schooly environment
 * variables are not configured on Vercel, a top-level createClient() would
 * abort the entire production build with `supabaseUrl is required`.
 */
export function getSchoolyAdminDb() {
  const url = process.env.SCHOOLY_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SCHOOLY_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new Error('Schooly Supabase URL is not configured (SCHOOLY_SUPABASE_URL).');
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Schooly Supabase service role key is not configured (SCHOOLY_SUPABASE_SERVICE_ROLE_KEY).'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
