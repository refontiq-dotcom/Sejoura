import { describe, it, expect } from "vitest";
import { normalizePgDateToUtcMidnight } from "../src/lib/pg-date";

// ──────────────────────────────────────────────────────────────────────────────
// Normalisation des DATE `pg` vers minuit UTC (sans base de données).
// Couvre les formes réellement renvoyées par le pilote : chaîne "YYYY-MM-DD",
// chaîne ISO complète, objet Date — sans affaiblir les assertions
// anti-double-réservation (fuseaux et chevauchement préservés).
// ──────────────────────────────────────────────────────────────────────────────

describe("normalizePgDateToUtcMidnight — formes DATE du pilote pg", () => {
  it("accepte une chaîne YYYY-MM-DD et fige à minuit UTC", () => {
    const d = normalizePgDateToUtcMidnight("2026-11-13");
    expect(d.toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });

  it("accepte une chaîne ISO complète (timestamptz)", () => {
    const d = normalizePgDateToUtcMidnight("2026-11-13T00:00:00.000Z");
    expect(d.toISOString().slice(0, 10)).toBe("2026-11-13");
  });

  it("accepte un objet Date (parser surchargé) sans concaténation", () => {
    const input = new Date("2026-11-13T15:30:00.000Z");
    const d = normalizePgDateToUtcMidnight(input);
    // Minuit UTC du même jour calendaire UTC — pas de décalage local.
    expect(d.toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });

  it("retourne Invalid Date pour null, undefined et chaînes non-dates", () => {
    for (const bad of [null, undefined, "", "null", "undefined", "not-a-date", 12345]) {
      expect(Number.isNaN(normalizePgDateToUtcMidnight(bad).getTime())).toBe(true);
    }
  });

  it("ne produit jamais le RangeError historique sur toISOString après garde", () => {
    // L'ancien code `new Date(String(v) + 'T00:00:00Z').toISOString()` levait
    // `RangeError: Invalid time value` pour un objet Date. Ici la garde
    // `isNaN(getTime())` de l'appelant intercepte avant tout toISOString().
    const d = normalizePgDateToUtcMidnight(new Date("2026-11-13T00:00:00.000Z"));
    expect(() => d.toISOString()).not.toThrow();
  });
});
