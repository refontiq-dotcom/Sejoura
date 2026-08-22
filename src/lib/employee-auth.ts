import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Signs in an employee server-side using Supabase admin auth.
 * Returns only the session tokens — never exposes the internal password.
 */
export async function signInEmployeeServerSide(
  userId: string,
  email: string,
  phone: string | null
): Promise<{ session: { access_token: string; refresh_token: string; expires_in: number; token_type: string } } | null> {
  const admin = createAdminClient();
  const loginEmail = email || `${phone?.replace(/[^0-9]/g, "")}@employe.sejoura.com`;
  const internalPassword = `sejoura_emp_${userId.replace(/-/g, "").slice(0, 16)}`;

  const { data, error } = await admin.auth.signInWithPassword({
    email: loginEmail,
    password: internalPassword,
  });

  if (error || !data.session) {
    return null;
  }

  return {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
    },
  };
}
