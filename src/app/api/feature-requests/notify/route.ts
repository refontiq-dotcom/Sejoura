import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// ============================================================================
// POST /api/feature-requests/notify
//
// Alerte WhatsApp "nouvelle suggestion" via Evolution API.
// Appelé (fire-and-forget) par le client juste après l'insertion d'une idée.
//
// Configuration (variables d'environnement, côté serveur uniquement) :
//   FEATURE_ALERT_EVOLUTION_API_URL  → base de l'API, ex. https://evo.mondomaine.com
//   FEATURE_ALERT_EVOLUTION_INSTANCE → nom de l'instance Evolution
//   FEATURE_ALERT_EVOLUTION_TOKEN    → clé d'API de l'instance
//   FEATURE_ALERT_TO_PHONE           → numéro destinataire (format international,
//                                       ex. 221771234567)
//   FEATURE_ALERT_ADMIN_URL          → lien vers le dashboard admin dans le message
// Si une de ces variables manque, la route ne fait rien (aucune erreur remontée).
// ============================================================================

const IMPACT_LABELS: Record<string, string> = {
  essential: "Essentiel au quotidien",
  nice_to_have: "Pratique d'avoir",
};

const CATEGORY_LABELS: Record<string, string> = {
  new_feature: "Nouvelle fonctionnalité",
  page_improvement: "Amélioration d'une page",
  bug_report: "Petit bug",
};

function isConfigured(): boolean {
  return Boolean(
    process.env.FEATURE_ALERT_EVOLUTION_API_URL &&
      process.env.FEATURE_ALERT_EVOLUTION_INSTANCE &&
      process.env.FEATURE_ALERT_EVOLUTION_TOKEN &&
      process.env.FEATURE_ALERT_TO_PHONE
  );
}

async function sendEvolutionMessage(text: string): Promise<boolean> {
  const baseUrl = process.env.FEATURE_ALERT_EVOLUTION_API_URL!.replace(/\/+$/, "");
  const instance = process.env.FEATURE_ALERT_EVOLUTION_INSTANCE!;
  const token = process.env.FEATURE_ALERT_EVOLUTION_TOKEN!;
  const number = process.env.FEATURE_ALERT_TO_PHONE!;

  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: token,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      number,
      text,
    }),
    // Échec rapide : ne bloque jamais le retour utilisateur
    signal: AbortSignal.timeout(10_000),
  });

  return res.ok;
}

export async function POST(req: Request) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Identifiant de suggestion manquant." }, { status: 400 });
    }

    if (!isConfigured()) {
      return NextResponse.json({ sent: false, skipped: true });
    }

    const serverSupabase = await createServerClient();
    const { data: { session } } = await serverSupabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { data: idea } = await adminSupabase
      .from("feature_requests")
      .select("id, title, category, impact, tenant_id")
      .eq("id", id)
      .maybeSingle();
    if (!idea) {
      return NextResponse.json({ error: "Suggestion introuvable." }, { status: 404 });
    }

    const { data: tenant } = await adminSupabase
      .from("tenants")
      .select("company_name")
      .eq("id", idea.tenant_id)
      .maybeSingle();

    const adminUrl = process.env.FEATURE_ALERT_ADMIN_URL || "https://app.sejoura.com/admin/ideas";

    const text = [
      "\uD83D\uDCA1 Nouvelle suggestion soumise !",
      `Auteur : ${tenant?.company_name || "Établissement inconnu"}`,
      `Titre : ${idea.title}`,
      `Impact choisi : ${IMPACT_LABELS[idea.impact] || idea.impact}`,
      `Catégorie : ${CATEGORY_LABELS[idea.category] || idea.category}`,
      "",
      `\uD83D\uDD17 Cliquer ici pour ouvrir le Dashboard Admin : ${adminUrl}`,
    ].join("\n");

    const sent = await sendEvolutionMessage(text);

    return NextResponse.json({ sent });
  } catch (error) {
    // Ne jamais faire échouer l'insertion de l'idée à cause de l'alerte
    console.error("feature-request notify:", error);
    return NextResponse.json({ sent: false, error: "notification_failed" });
  }
}
