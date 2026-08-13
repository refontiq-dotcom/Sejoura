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

    const admin = createAdminClient();

    const { data: userData } = await admin
      .from("users")
      .select("id, tenant_id, role, is_active")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (!userData) {
      // Aucun profil applicatif : c'est un compte qui vient de valider
      // l'étape 1 (inscription) sans avoir terminé l'étape 2, ou un employé.
      const email = (session.user.email || "").toLowerCase();
      const metaRole = session.user.user_metadata?.role;
      const isEmployee =
        email.includes("@employe.sejoura.com") ||
        metaRole === "receptionniste" ||
        metaRole === "menagere";

      return NextResponse.json({
        needsOnboarding: !isEmployee,
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

    return NextResponse.json({
      needsOnboarding: !accommodation,
      tenantId: userData.tenant_id,
      accommodationId: accommodation?.id ?? null,
    } satisfies OnboardingStatusResponse);
  } catch {
    return NextResponse.json(
      { needsOnboarding: false, tenantId: null, accommodationId: null } satisfies OnboardingStatusResponse,
      { status: 500 }
    );
  }
}
