/**
 * Helpers WebAuthn partagés entre les routes API biométriques.
 *
 * Le RP ID doit correspondre au domaine sur lequel l'application tourne
 * (ex. mon-preview.monkeycode-ai.live) : on le dérive de l'en-tête Origin
 * de la requête pour fonctionner en local ET sur tous les domaines de preview.
 */

import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

/** Normalise une valeur JSONB de transports en liste typée WebAuthn */
export function normalizeTransports(value: unknown): AuthenticatorTransportFuture[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((t): t is AuthenticatorTransportFuture => typeof t === "string");
}

/** Extrait l'origine de la requête (ex. https://app.example.com) */
export function getRequestOrigin(request: Request): string {
  const origin = request.headers.get("origin")?.trim();
  if (origin && /^https?:\/\//i.test(origin)) return origin;
  const url = new URL(request.url);
  return url.origin;
}

/** RP ID = hostname de l'origine (ex. app.example.com) */
export function getRpId(request: Request): string {
  const origin = getRequestOrigin(request);
  return new URL(origin).hostname;
}

/** Nom lisible de l'appareil à partir de l'en-tête User-Agent */
export function getDeviceName(request: Request): string {
  const ua = request.headers.get("user-agent") || "";

  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s[\d.]+/i);
    return match ? `Android ${match[0].replace(/Android\s?/i, "")}` : "Android";
  }
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux";
  if (/CrOS/i.test(ua)) return "Chromebook";
  return "Appareil";
}

