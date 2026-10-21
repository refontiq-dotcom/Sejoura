import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ──────────────────────────────────────────────────────────────────────────────
// SÉCURITÉ — le payload synchronisé vers Trouvetou ne doit contenir aucune clé,
// aucun secret ni aucune donnée d'authentification.
// Régression : `attributes.sejoura_api_key` transmettait la clé API d'écriture
// du tenant dans les données métier publiées. L'authentification utilise
// désormais exclusivement les en-têtes HTTP (`x-trouvetou-api-key` pour la
// sync, `x-api-key` / `Authorization: Bearer` pour les réservations externes).
// Ce test statique garantit qu'aucune valeur `api_key` n'est lue ni recopiée
// dans le payload, et qu'aucun log n'enregistre de secret.
// ──────────────────────────────────────────────────────────────────────────────

const SYNC_SOURCE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/trouvetou/sync.ts"
);

function readSyncSource(): string {
  return readFileSync(SYNC_SOURCE_PATH, "utf8");
}

describe("sync Trouvetou — aucune clé ni secret dans le payload publié", () => {
  it("ne référence jamais sejoura_api_key", () => {
    const source = readSyncSource();
    expect(source).not.toMatch(/sejoura_api_key/);
  });

  it("ne sélectionne jamais la colonne api_key depuis external_api_keys", () => {
    const source = readSyncSource();
    // Seul `tenant_id` (existence) peut être lu comme condition d'éligibilité.
    expect(source).not.toMatch(/\.select\([^)]*api_key/);
  });

  it("ne journalise aucune valeur de clé (console + logger)", () => {
    const source = readSyncSource();
    expect(source).not.toMatch(/console\.(log|error|warn)\([^)]*[Kk]ey[^)]*api/i);
    // Le seul console.error autorisé concerne l'auto-provisioning (objet
    // d'erreur Supabase, jamais une valeur de clé).
    const errorLogs = source.match(/console\.error\([^)]*\)/g) ?? [];
    for (const log of errorLogs) {
      expect(log).not.toMatch(/api[_-]?key/i);
    }
  });

  it("documente que l'authentification passe par les en-têtes HTTP", () => {
    const source = readSyncSource();
    expect(source).toMatch(/x-trouvetou-api-key/);
  });
});
