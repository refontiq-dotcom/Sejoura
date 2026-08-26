import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/essentiel/boost-express
// Active le Boost Express ponctuel pour un établissement (plan ESSENTIEL).
// Le Boost Express est temporaire (durée configurable, défaut 3 jours).
// L'accès au Boost Permanent (is_permanently_boosted) reste interdit ici.
// ──────────────────────────────────────────────────────────────────────────────

// Tarifs Express autorisés (FCFA) — extensible sans modifier le schéma
const EXPRESS_BOOST_OPTIONS: Record<number, number> = {
  3:  5_000,
  7:  10_000,
  14: 18_000,
};

async function verifyAdminAuth(request: Request, tenantId: string) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Non authentifié.", status: 401 } as const;

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from("users")
    .select("id, tenant_id, role")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (!userData || userData.role !== "admin_residence" || userData.tenant_id !== tenantId) {
    return { error: "Accès non autorisé.", status: 403 } as const;
  }
  return { admin } as const;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
    const accommodationId =
      typeof body?.accommodationId === "string" ? body.accommodationId.trim() : "";
    const durationDays =
      typeof body?.durationDays === "number" ? body.durationDays : 3;

    if (!tenantId || !accommodationId) {
      return NextResponse.json(
        { error: "tenantId et accommodationId sont requis" },
        { status: 400 }
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const auth = await verifyAdminAuth(request, tenantId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const admin = auth.admin;

    if (!EXPRESS_BOOST_OPTIONS[durationDays]) {
      return NextResponse.json(
        {
          error: `Durée invalide. Options disponibles : ${Object.keys(EXPRESS_BOOST_OPTIONS).join(", ")} jours`,
        },
        { status: 400 }
      );
    }

    const priceFcfa = EXPRESS_BOOST_OPTIONS[durationDays];

    // ─── 1. Vérification du plan ─────────────────────────────────────────────
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const plan = subscription?.plan ?? "";
    const status = subscription?.status ?? "";

    if (plan !== "essentiel") {
      return NextResponse.json(
        {
          error:
            plan === "entreprise" || plan === "enterprise"
              ? "Votre formule ENTREPRISE inclut déjà le Boost Permanent. Le Boost Express n'est pas nécessaire."
              : "Le Boost Express est réservé à la formule ESSENTIEL (15 000 FCFA/mois).",
        },
        { status: 403 }
      );
    }

    if (status === "suspended" || status === "cancelled") {
      return NextResponse.json(
        { error: "Votre abonnement est suspendu. Régularisez votre situation pour activer un Boost." },
        { status: 403 }
      );
    }

    // ─── 2. Vérification que l'établissement appartient au tenant ────────────
    const { data: accommodation, error: accError } = await admin
      .from("accommodations")
      .select("id, tenant_id, is_permanently_boosted, boost_express_expires_at")
      .eq("id", accommodationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (accError || !accommodation) {
      return NextResponse.json(
        { error: "Établissement introuvable ou accès non autorisé" },
        { status: 404 }
      );
    }

    // Garde-fou : un établissement avec Boost Permanent ne doit pas recevoir un Boost Express
    if (accommodation.is_permanently_boosted) {
      return NextResponse.json(
        { error: "Cet établissement bénéficie déjà du Boost Permanent." },
        { status: 409 }
      );
    }

    // ─── 3. Calcul de l'expiration ───────────────────────────────────────────
    // Si un Boost Express est déjà actif, on prolonge depuis sa date d'expiration
    const now = new Date();
    const currentExpiry =
      accommodation.boost_express_expires_at &&
      new Date(accommodation.boost_express_expires_at) > now
        ? new Date(accommodation.boost_express_expires_at)
        : now;

    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + durationDays);

    // ─── 4. Mise à jour ──────────────────────────────────────────────────────
    const { error: updateError } = await admin
      .from("accommodations")
      .update({
        boost_express_expires_at: newExpiry.toISOString(),
        boost_express_price_paid: priceFcfa,
      })
      .eq("id", accommodationId)
      .eq("tenant_id", tenantId);

    if (updateError) {
      console.error("essentiel/boost-express update error:", updateError);
      return NextResponse.json(
        { error: updateError.message || "L'action a échoué : activer le Boost Express" },
        { status: 500 }
      );
    }

    // ─── 5. Réponse ──────────────────────────────────────────────────────────
    const formattedExpiry = newExpiry.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return NextResponse.json({
      success: true,
      type: "express",
      durationDays,
      priceFcfa,
      expiresAt: newExpiry.toISOString(),
      message: `⚡ Boost Express activé ! Votre établissement apparaît en tête de liste jusqu'au ${formattedExpiry}.`,
    });
  } catch (error) {
    console.error("POST /api/v1/essentiel/boost-express error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/essentiel/boost-express
// Annule le Boost Express (remet boost_express_expires_at à NULL)
// ──────────────────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") ?? "";
    const accommodationId = searchParams.get("accommodationId") ?? "";

    if (!tenantId || !accommodationId) {
      return NextResponse.json(
        { error: "tenantId et accommodationId sont requis" },
        { status: 400 }
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const auth = await verifyAdminAuth(request, tenantId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const admin = auth.admin;

    // Vérification plan
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (subscription?.plan !== "essentiel") {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const { error } = await admin
      .from("accommodations")
      .update({ boost_express_expires_at: null, boost_express_price_paid: 0 })
      .eq("id", accommodationId)
      .eq("tenant_id", tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Boost Express annulé." });
  } catch (error) {
    console.error("DELETE /api/v1/essentiel/boost-express error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
