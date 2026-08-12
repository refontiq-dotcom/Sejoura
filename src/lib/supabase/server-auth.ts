import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServerUser = {
  id: string;
  tenantId: string | null;
};

/**
 * Authentifie l'appelant via le header `Authorization: Bearer <token>`
 * en utilisant la session Supabase (admin.auth.getUser).
 *
 * Retourne l'id de l'utilisateur et son tenant, ou null si non authentifié.
 */
export async function getServerUser(
  admin: SupabaseClient,
  request: Request
): Promise<ServerUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const { data: user, error: userError } = await admin.auth.getUser(token);
  if (userError || !user?.user) return null;

  const { data: userRow } = await admin
    .from("users")
    .select("tenant_id")
    .eq("auth_user_id", user.user.id)
    .maybeSingle();

  return {
    id: user.user.id,
    tenantId: userRow?.tenant_id ?? null,
  };
}

/**
 * Variante rapide : retourne uniquement l'utilisateur authentifié.
 * Lève une erreur explicite si le service role key n'est pas configuré.
 */
export function getServerAdmin() {
  return createAdminClient();
}
