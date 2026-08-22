import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/enterprise/boost
// Active / désactive le Boost Permanent pour un établissement (plan ENTREPRISE).
// Écrit is_permanently_boosted (nouveau paradigme) — le trigger SQL
// check_permanent_boost_plan vérifie en base que le plan est bien Entreprise.
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const body = await request.json();
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
    const accommodationId =
      typeof body?.accommodationId === "string" ? body.accommodationId : "";
    const boost = typeof body?.boost === "boolean" ? body.boost : false;

    if (!tenantId || !accommodationId) {
      return NextResponse.json(
        { error: "tenantId et accommodationId sont requis" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Vérifier que l'appelant est admin du tenant
    const { data: userData } = await admin
      .from("users")
      .select("id, tenant_id, role")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (!userData || userData.role !== "admin_residence" || userData.tenant_id !== tenantId) {
      return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    }

    // Vérification plan côté API (double-sécurité avec le trigger SQL)
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const plan = subscription?.plan ?? "";
    const isEnterprise = plan === "entreprise" || plan === "enterprise";

    if (!isEnterprise) {
      return NextResponse.json(
        { error: "Le Boost Permanent Trouvetou est réservé à la formule Entreprise (55 000 FCFA/mois)" },
        { status: 403 }
      );
    }

    // Mise à jour : is_permanently_boosted (nouveau champ)
    // Le trigger SQL vérifie également le plan avant d'accepter.
    // On ne touche PAS à boost_expires_at — le boost Entreprise n'expire pas.
    const { error } = await admin
      .from("accommodations")
      .update({ is_permanently_boosted: boost })
      .eq("id", accommodationId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("enterprise/boost update error:", error);
      return NextResponse.json(
        { error: error.message || "Impossible de mettre à jour le statut boost" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      boost,
      type: "permanent",
      message: boost
        ? "⭐ Boost Permanent activé — votre établissement apparaît en tête de liste sur Trouvetou."
        : "Boost Permanent désactivé.",
    });
  } catch (error) {
    console.error("POST /api/v1/enterprise/boost error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
