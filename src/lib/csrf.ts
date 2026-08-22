/**
 * ============================================================================
 * SEJOURA — CSRF TOKEN PROTECTION (Double-Submit Cookie)
 * ============================================================================
 *
 * Protege les routes API contre les attaques CSRF.
 *
 * Fonctionnement (Double-Submit Cookie):
 * 1. A la connexion, un token est genere et stocke dans 2 cookies :
 *    - Un cookie HttpOnly (server-only, inaccessible au JS)
 *    - Un cookie lisible (accessible au JS pour l'inclure dans les headers)
 * 2. Le client lit le cookie lisible et l'envoie dans le header x-csrftoken
 * 3. Le serveur compare le header avec le cookie lisible (meme valeur = legitime)
 *
 * Pourquoi ca marche: un site malveillant peut declencher des requetes avec
 * les cookies, mais ne peut PAS lire les cookies d'un autre domaine (Same-Origin
 * Policy) ni les inclure dans un header personnalise (CORS).
 *
 * Usage cote serveur (routes API):
 *   import { validateCsrfRequest } from "@/lib/csrf";
 *   if (!(await validateCsrfRequest(request))) {
 *     return NextResponse.json({ error: "CSRF token invalide" }, { status: 403 });
 *   }
 */

import { cookies } from "next/headers";

const CSRF_COOKIE = "sejoura-csrf-token";
const CSRF_HEADER = "x-csrftoken";
const TOKEN_LENGTH = 32;

// Routes exemptees du CSRF (pas de session utilisateur)
const CSRF_EXEMPT_PATHS = [
  "/api/webhooks/",
  "/api/v1/webhooks/",
  "/api/cron/",
  "/api/v1/cron/",
  "/api/stay/",
  "/api/v1/external/",
  "/api/register",
  "/api/auth/",
];

/**
 * Genere un token aleatoire.
 */
function generateToken(): string {
  const array = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Definit les cookies CSRF (appele lors de la connexion).
 */
export async function setCsrfCookies(): Promise<string> {
  const token = generateToken();
  const store = await cookies();

  // Cookie HttpOnly — inaccessible au JS, envoye automatiquement par le navigateur
  store.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
  });

  // Cookie lisible — le client le lit et l'envoie dans le header
  store.set(CSRF_COOKIE + "-pub", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
  });

  return token;
}

/**
 * Supprime les cookies CSRF (appele lors de la deconnexion).
 */
export async function clearCsrfCookies(): Promise<void> {
  const store = await cookies();
  store.delete(CSRF_COOKIE);
  store.delete(CSRF_COOKIE + "-pub");
}

/**
 * Valide la protection CSRF d'une requete.
 *
 * @returns true si la requete est legitime ou si le CSRF n'est pas applicable
 */
export async function validateCsrfRequest(request: Request): Promise<boolean> {
  const method = request.method.toUpperCase();

  // Les requetes GET/HEAD/OPTIONS ne sont pas vulnerables au CSRF
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const url = new URL(request.url);

  // Exempter les webhooks, crons, et routes publiques
  if (CSRF_EXEMPT_PATHS.some((p) => url.pathname.startsWith(p))) {
    return true;
  }

  // Lire le cookie public (la meme valeur que le token)
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE + "-pub")?.value;

  // Pas de cookie CSRF = premiere requete mutation sans connexion
  // On autorise pour ne pas casser l'UX (l'auth check fera le travail)
  if (!cookieToken) {
    return true;
  }

  // Lire le header CSRF
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken) {
    return false;
  }

  // Comparaison timing-safe
  if (cookieToken.length !== headerToken.length) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(cookieToken);
  const b = encoder.encode(headerToken);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Headers a ajouter dans les fetch cote client pour les mutations.
 *
 * Usage:
 *   const res = await fetch("/api/booking", {
 *     method: "POST",
 *     ...csrfFetchHeaders(),
 *     body: JSON.stringify(data),
 *   });
 */
export function csrfFetchHeaders(): { headers: Record<string, string> } {
  return {
    headers: {
      [CSRF_HEADER]: getCookieValue(CSRF_COOKIE + "-pub"),
    },
  };
}

/**
 * Lit la valeur d'un cookie cote client (accessible uniquement via document.cookie).
 * Ne fonctionne que dans le navigateur.
 */
function getCookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : "";
}
