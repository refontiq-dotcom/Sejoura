import { createClient } from '@supabase/supabase-js';

export const schoolyAdminDb = createClient(
  process.env.SCHOOLY_SUPABASE_URL!,
  process.env.SCHOOLY_SUPABASE_SERVICE_ROLE_KEY!
);