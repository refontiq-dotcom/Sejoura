/**
 * Résolution des variables d'environnement Supabase.
 *
 * Les projets Supabase récents exposent la clé publique sous deux formats :
 *  - ancienne « anon key »  : NEXT_PUBLIC_SUPABASE_ANON_KEY
 *  - nouvelle « publishable » : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * On accepte les deux pour ne pas casser les déploiements selon le type de
 * clé configuré (ex. Vercel), et on renvoie une chaîne vide si rien n'est
 * défini afin d'éviter un crash au rendu.
 */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

export function getSupabasePublicKey(): string {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  return anonKey || publishableKey || "";
}
