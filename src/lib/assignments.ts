import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Retourne l'accommodation_id actif pour un employé à la date du jour.
 *
 * Logique :
 * 1. Cherche dans employee_assignments une entrée active :
 *    start_date <= aujourd'hui ET (end_date IS NULL OU end_date >= aujourd'hui)
 * 2. Si aucune affectation active → retourne permanentAccommodationId (users.accommodation_id)
 * 3. Si permanentAccommodationId est aussi null → l'admin voit tout (pas de filtre)
 */
export async function getActiveAssignmentId(
  supabase: SupabaseClient,
  userId: string,
  permanentAccommodationId: string | null
): Promise<string | null> {
  if (!userId) return permanentAccommodationId;

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const { data } = await supabase
    .from("employee_assignments")
    .select("accommodation_id, start_date, end_date")
    .eq("user_id", userId)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.accommodation_id) {
    return data.accommodation_id;
  }

  return permanentAccommodationId;
}

/**
 * Vérifie si un employé est actuellement en affectation temporaire
 * (c'est-à-dire : l'affectation active a une end_date non null).
 *
 * Retourne l'entrée d'affectation si elle est temporaire, null sinon.
 */
export async function getTemporaryAssignment(
  supabase: SupabaseClient,
  userId: string
): Promise<{ accommodation_id: string; start_date: string; end_date: string } | null> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("employee_assignments")
    .select("accommodation_id, start_date, end_date")
    .eq("user_id", userId)
    .lte("start_date", today)
    .not("end_date", "is", null)
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.end_date) {
    return data as { accommodation_id: string; start_date: string; end_date: string };
  }
  return null;
}
