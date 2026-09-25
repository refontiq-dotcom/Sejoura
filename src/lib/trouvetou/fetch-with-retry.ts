/**
 * TROUVETOU — fetch avec retry (couche 1 de fiabilité)
 *
 * Enveloppe un appel fetch() avec :
 *   - retry automatique sur erreur réseau (timeout, DNS, connexion coupée) et
 *     sur réponses HTTP 5xx / 408 / 429 (probablement transitoires)
 *   - AUCUN retry sur 4xx (401, 400, 403...) : une clé API invalide ou un
 *     payload rejeté ne se corrigera pas en réessayant, ça gaspillerait du
 *     temps et masquerait le vrai problème.
 *   - backoff court (800ms puis 2000ms) pour rester largement sous les
 *     limites de timeout des fonctions serverless (10s sur Vercel Hobby).
 *
 * Utilisé par tout code qui pousse des données vers l'API d'ingestion
 * Trouvetou (Séjoura et, de façon identique, Schooly).
 */

export interface RetryResult {
  response: Response | null;
  attempts: number;
  lastError: Error | null;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_DELAYS_MS = [800, 2000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Effectue jusqu'à `delays.length + 1` tentatives. Retourne dès qu'une
 * réponse HTTP est obtenue et n'est pas dans RETRYABLE_STATUS (y compris les
 * réponses 4xx, qu'on ne retente jamais). Ne lève pas d'exception : c'est à
 * l'appelant de vérifier `result.response` / `result.lastError`.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  delays: number[] = DEFAULT_DELAYS_MS
): Promise<RetryResult> {
  const maxAttempts = delays.length + 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init);

      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
        if (attempt > 1) {
          console.warn(
            `[trouvetou-sync] Réussi après ${attempt} tentative(s) (HTTP ${response.status}).`
          );
        }
        return { response, attempts: attempt, lastError: null };
      }

      console.warn(
        `[trouvetou-sync] Tentative ${attempt}/${maxAttempts} : HTTP ${response.status}, nouvel essai dans ${delays[attempt - 1]}ms.`
      );
      await sleep(delays[attempt - 1]);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxAttempts) {
        console.warn(
          `[trouvetou-sync] Échec définitif après ${attempt} tentative(s) : ${lastError.message}`
        );
        return { response: null, attempts: attempt, lastError };
      }

      console.warn(
        `[trouvetou-sync] Tentative ${attempt}/${maxAttempts} : erreur réseau "${lastError.message}", nouvel essai dans ${delays[attempt - 1]}ms.`
      );
      await sleep(delays[attempt - 1]);
    }
  }

  // Inatteignable en pratique (la boucle retourne toujours avant), gardé pour TypeScript.
  return { response: null, attempts: maxAttempts, lastError };
}
