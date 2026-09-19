// ============================================================================
// Séjoura — notifications Telegram + miroir vers Refontiq Control Center.
// ============================================================================

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]\`])/g, "\\$1");
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function getTelegramAdminUrl(fallback: string): string {
  return process.env.TELEGRAM_ADMIN_URL || fallback;
}

async function mirrorToControlCenter(message: string): Promise<void> {
  const baseUrl = process.env.CONTROL_CENTER_URL?.trim();
  const secret = process.env.METRICS_PUSH_SECRET?.trim();
  if (!baseUrl || !secret) return;

  try {
    await fetch(`${baseUrl.replace(/\/$/, "")}/api/telegram-alerts/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        project: "sejoura",
        level: "info",
        title: "Alerte Séjoura",
        message,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("Control Center Telegram mirror failed:", error);
  }
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const mirrorPromise = mirrorToControlCenter(text);

  if (!isTelegramConfigured()) {
    await mirrorPromise;
    return false;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  const telegramPromise = fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  const [telegramResult] = await Promise.allSettled([telegramPromise, mirrorPromise]);
  if (telegramResult.status !== "fulfilled") return false;
  return telegramResult.value.ok;
}
