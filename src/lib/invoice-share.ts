import type { Invoice } from "@/types/database";

/**
 * Construit l'URL publique de téléchargement d'une facture à partir de son
 * jeton d'accès (QR Code). L'URL est absolue pour qu'elle reste scannable
 * telle quelle depuis n'importe quel client mobile.
 *
 * Si l'environnement n'expose pas NEXT_PUBLIC_APP_URL, on retombe sur
 * l'origine de la requête courante ou, en dernier recours, sur un placeholder
 * `https://<host>` dérivé de l'environnement d'exécution.
 */
export function getInvoiceDownloadUrl(invoice: Pick<Invoice, "access_token"> & { id?: string }, fallbackOrigin?: string): string | null {
  if (!invoice?.access_token) return null;
  const origin = resolveAppOrigin(fallbackOrigin);
  if (!origin) return null;
  return `${origin}/api/invoice/download/${invoice.access_token}`;
}

function resolveAppOrigin(fallbackOrigin?: string): string | null {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  const raw = env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL;
  if (raw && /^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }
  if (fallbackOrigin) return fallbackOrigin.replace(/\/+$/, "");
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return null;
}
