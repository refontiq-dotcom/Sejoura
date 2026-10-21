import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface OnboardingStatusResponse {
  needsOnboarding: boolean;
  tenantId: string | null;
  accommodationId: string | null;
}

/**
 * Détermine de façon fiable si le compte connecté doit encore compléter
 * l'étape 2 (configuration de l'établissement).
 *
 * La décision est prise côté serveur avec le client admin (service_role) qui
 * contourne les politiques RLS : un gérant dont le tenant et l'établissement
 * existent n'est JAMAIS renvoyé vers l'étape 2, même si le client navigateur
 * ne peut pas lire la table `accommodations` (politique manquante, etc.).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { needsOnboarding: false, tenantId: null, accommodationId: null } satisfies OnboardingStatusResponse,
        { status: 401 }
      );
    }

    // Le client admin (service_role) contourne les RLS pour vérifier
    // l'onboarding. En dev local, la clé peut manquer : on dégrade vers le
    // client de session (RLS) plutôt que de renvoyer une 500. Les lectures
    // « profil propre » et « établissements du tenant » disposent de
    // politiques compatibles, et accommodationError est déjà géré plus bas.
    let admin = supabase;
    try {
      admin = createAdminClient() as typeof supabase;
    } catch {
      console.warn(
        "[onboarding-status] SUPABASE_SERVICE_ROLE_KEY absente : dégradation vers le client de session."
      );
    }

    const { data: userData } = await admin
      .from("users")
      .select("id, tenant_id, role, is_active")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (!userData) {
      // Une inscription Sejoura réussie crée déjà le tenant ET le premier
      // établissement. Juste après l'inscription, le trigger du profil peut
      // être légèrement en retard ; dans ce cas les métadonnées du compte
      // constituent la preuve que l'établissement vient d'être renseigné.
      // On ne doit surtout pas afficher une seconde demande de création.
      const email = (session.user.email || "").toLowerCase();
      const metadata = session.user.user_metadata ?? {};
      const metaRole = metadata.role;
      const isEmployee =
        email.includes("@employe.sejoura.com") ||
        metaRole === "receptionniste" ||
        metaRole === "menagere";
      const hasCompletedRegistration =
        metaRole === "admin_residence" &&
        typeof metadata.residence_name === "string" &&
        metadata.residence_name.trim().length > 0;

      return NextResponse.json({
        needsOnboarding: !isEmployee && !hasCompletedRegistration,
        tenantId: null,
        accommodationId: null,
      } satisfies OnboardingStatusResponse);
    }

    // L'onboarding (étape 2) est strictement réservé aux admin_residence.
    if (userData.role !== "admin_residence") {
      return NextResponse.json({
        needsOnboarding: false,
        tenantId: userData.tenant_id,
        accommodationId: null,
      } satisfies OnboardingStatusResponse);
    }

    // Profil existant mais aucune entreprise rattachée : étape 2 à reprendre.
    if (!userData.tenant_id) {
      return NextResponse.json({
        needsOnboarding: true,
        tenantId: null,
        accommodationId: null,
      } satisfies OnboardingStatusResponse);
    }

    const { data: accommodation, error: accommodationError } = await admin
      .from("accommodations")
      .select("id")
      .eq("tenant_id", userData.tenant_id)
      .limit(1)
      .maybeSingle();

    if (accommodationError) {
      // Si l'état ne peut pas être vérifié côté serveur, on ne bloque pas
      // l'utilisateur : le tableau de bord gère lui-même l'état vide.
      return NextResponse.json({
        needsOnboarding: false,
        tenantId: userData.tenant_id,
        accommodationId: null,
      } satisfies OnboardingStatusResponse);
    }

    // Si l'inscription vient juste de se terminer et que la lecture de
    // l'établissement est momentanément en retard, les métadonnées
    // d'inscription évitent de demander à nouveau de le créer.
    const metadata = session.user.user_metadata ?? {};
    const hasCompletedRegistration =
      metadata.role === "admin_residence" &&
      typeof metadata.residence_name === "string" &&
      metadata.residence_name.trim().length > 0;

    return NextResponse.json({
      needsOnboarding: !accommodation && !hasCompletedRegistration,
      tenantId: userData.tenant_id,
      accommodationId: accommodation?.id ?? null,
    } satisfies OnboardingStatusResponse);
  } catch (error) {
    // Log serveur pour diagnostiquer les 500 (sinon le catch silencieux
    // masque la cause réelle, ex. clé service_role manquante).
    console.error("[onboarding-status] erreur inattendue :", error);
    return NextResponse.json(
      { needsOnboarding: false, tenantId: null, accommodationId: null } satisfies OnboardingStatusResponse,
      { status: 500 }
    );
  }
}
