import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// ============================================================================
// POST /api/feature-requests/notify
//
// Alerte Telegram "nouvelle suggestion" via la Bot API.
// Appelé (fire-and-forget) par le client juste après l'insertion d'une idée.
//
// Configuration (variables d'environnement, côté serveur uniquement) :
//   TELEGRAM_BOT_TOKEN → token du bot Telegram (fourni par @BotFather)
//   TELEGRAM_CHAT_ID   → identifiant du chat destinataire (ex. un canal privé)
//   TELEGRAM_ADMIN_URL → lien vers le dashboard admin dans le message
//                        (défaut : https://app.sejoura.com/admin/ideas)
// Si TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manque, la route ne fait rien
// (aucune erreur remontée).
// ============================================================================

// Échappement des caractères spéciaux du parse_mode "Markdown" (legacy) :
// _, *, [, ], `, \ doivent être préfixés d'un backslash hors entité de format.
function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]`\\])/g, "\\$1");
}

function isConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
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
      .select("id, title, created_by, tenant_id")
      .eq("id", id)
      .maybeSingle();
    if (!idea) {
      return NextResponse.json({ error: "Suggestion introuvable." }, { status: 404 });
    }

    const [{ data: tenant }, { data: author }] = await Promise.all([
      adminSupabase
        .from("tenants")
        .select("company_name")
        .eq("id", idea.tenant_id)
        .maybeSingle(),
      adminSupabase
        .from("users")
        .select("full_name")
        .eq("id", idea.created_by)
        .maybeSingle(),
    ]);

    const adminUrl = process.env.TELEGRAM_ADMIN_URL || "https://app.sejoura.com/admin/ideas";

    const text = [
      "\uD83D\uDCA1 *Nouvelle suggestion Sejoura !*",
      "",
      `\uD83D\uDCCC *Titre :* ${escapeMarkdown(idea.title)}`,
      `\uD83C\uDFE2 *Résidence :* ${escapeMarkdown(tenant?.company_name || "Établissement inconnu")}`,
      `\uD83D\uDC64 *Auteur :* ${escapeMarkdown(author?.full_name || "Utilisateur")}`,
      "",
      `\uD83D\uDD17 [Voir sur le Dashboard Admin](${adminUrl})`,
    ].join("\n");

    const sent = await sendTelegramMessage(text);

    return NextResponse.json({ sent });
  } catch (error) {
    // Ne jamais faire échouer l'insertion de l'idée à cause de l'alerte
    console.error("feature-request notify:", error);
    return NextResponse.json({ sent: false, error: "notification_failed" });
  }
}
