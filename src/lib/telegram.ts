// ============================================================================
// Utilitaire d'envoi d'alertes Telegram (Bot API).
//
// Utilisé par les routes serveur pour notifier le Super Admin, notamment :
//   - /api/feature-requests/notify  (nouvelle suggestion / idée)
//   - /api/subscription/notify-payment (nouvelle demande de validation d'abonnement)
//   - /api/ads/notify-payment (nouvelle demande de validation de publicité)
//
// Configuration (variables d'environnement, côté serveur uniquement) :
//   TELEGRAM_BOT_TOKEN → token du bot Telegram (fourni par @BotFather)
//   TELEGRAM_CHAT_ID   → identifiant du chat destinataire (ex. un canal privé)
//   TELEGRAM_ADMIN_URL → lien vers le dashboard admin dans le message
//                        (défaut : route /admin concernée)
// Si TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manque, l'envoi est simplement
// ignoré (aucune erreur remontée à l'appelant).
// ============================================================================

// Échappement des caractères spéciaux du parse_mode "Markdown" (legacy) :
// _, *, [, ], `, \ doivent être préfixés d'un backslash hors entité de format.
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]`\\])/g, "\\$1");
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

// Lien du message → dashboard admin. Le fallback par défaut de chaque appelant
// reste configurable via TELEGRAM_ADMIN_URL.
export function getTelegramAdminUrl(fallback: string): string {
  return process.env.TELEGRAM_ADMIN_URL || fallback;
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
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
