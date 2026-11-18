import { createHash, randomBytes, timingSafeEqual } from "crypto";

// ─── Hashing PIN (SHA-256 salé avec pepper) ──────────────────────────────────
// Format stocké : "sha256$<salt>$<hash>"
// Ce module est partagé entre l'API PIN (api/employee-pin) et l'API
// biométrique (api/employee-biometric/*) qui re-vérifie le PIN pour prouver
// l'identité avant l'enrôlement d'une clé Face ID / Empreinte.

const PIN_PATTERN = /^\d{4}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/**
 * Get pepper with strict validation in production.
 * Prevents a hardcoded fallback from weakening PIN security if PIN_PEPPER is missing.
 */
function getPepper(): string {
  const pepper = process.env.PIN_PEPPER?.trim();
  if (!pepper) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PIN_PEPPER must be configured in production environment."
      );
    }
    // Fallback allowed only in non-production environments
    return "sejoura_dev_pepper_temp";
  }
  return pepper;
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const pepper = getPepper();
  const hash = createHash("sha256")
    .update(salt + pin + pepper)
    .digest("hex");
  return `sha256$${salt}$${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "sha256") return false;
    const [, salt, storedHash] = parts;
    const pepper = getPepper();
    const computedHash = createHash("sha256")
      .update(salt + pin + pepper)
      .digest("hex");
    // Comparaison en temps constant pour éviter les timing attacks
    const a = Buffer.from(computedHash, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
