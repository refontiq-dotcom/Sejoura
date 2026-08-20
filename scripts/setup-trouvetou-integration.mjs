#!/usr/bin/env node
/**
 * SETUP COMPLET — Intégration Séjoura ↔ Trouvetou
 * =================================================
 * Ce script fait TOUT en une seule exécution :
 *   1. Clone Trouvetou en local
 *   2. Lit les credentials Trouvetou depuis le .env.local de Trouvetou
 *   3. Crée le provider "Séjoura" dans Trouvetou (génère la clé API)
 *   4. Affiche les variables d'env à configurer sur Vercel (Séjoura + Trouvetou)
 *   5. Récupère le TROUVETOU_SYNC_SECRET depuis Vercel via l'API
 *   6. Lance la première sync
 *
 * Usage :
 *   node scripts/setup-trouvetou-integration.mjs
 *
 * Prérequis :
 *   - git installé
 *   - Les credentials Supabase Trouvetou dans /home/dukoua/Projets/Trouvetou/trouvetou/.env.local
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { randomUUID, randomBytes, createHmac } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEJOURA_ROOT  = resolve(__dirname, "..");
const TROUVETOU_ROOT = "/home/dukoua/Projets/Trouvetou/trouvetou";

// ── Couleurs ─────────────────────────────────────────────────────────────────
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m";
const ok   = (m) => console.log(`${G}  ✅  ${m}${X}`);
const fail = (m) => console.log(`${R}  ❌  ${m}${X}`);
const warn = (m) => console.log(`${Y}  ⚠️   ${m}${X}`);
const info = (m) => console.log(`${C}  ℹ️   ${m}${X}`);
const step = (n, m) => console.log(`\n${B}${C}── Étape ${n} : ${m}${X}`);
const box  = (m) => console.log(`\n${B}${Y}  📋  ${m}${X}`);

// ── Charger .env.local ────────────────────────────────────────────────────────
function loadEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const vars = {};
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    vars[key] = val;
    if (!process.env[key]) process.env[key] = val;
  }
  return vars;
}

// ── Supabase REST ─────────────────────────────────────────────────────────────
async function sbFetch(url, serviceKey, path, opts = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

// ── Génération clé API ────────────────────────────────────────────────────────
function generateApiKey(providerId) {
  const secret = randomBytes(32).toString("base64url");
  return `tv_live_${providerId}.${secret}`;
}
function hashApiKey(apiKey, pepper) {
  return createHmac("sha256", pepper).update(apiKey).digest("hex");
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${B}╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   SETUP — Intégration Séjoura ↔ Trouvetou                ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${X}\n`);

  // ────────────────────────────────────────────────────────────────────────
  step(1, "Clone du repo Trouvetou");
  // ────────────────────────────────────────────────────────────────────────
  if (existsSync(TROUVETOU_ROOT)) {
    ok(`Trouvetou déjà présent dans ${TROUVETOU_ROOT}`);
  } else {
    info("Clonage de https://github.com/refontiq-dotcom/Trouvetou.git ...");
    try {
      execSync(
        "git clone https://github.com/refontiq-dotcom/Trouvetou.git /home/dukoua/Projets/Trouvetou",
        { stdio: "inherit" }
      );
      ok("Clone réussi !");
    } catch (e) {
      fail("Échec du clone : " + e.message);
      process.exit(1);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  step(2, "Chargement des variables d'env");
  // ────────────────────────────────────────────────────────────────────────
  const sejouraEnv    = loadEnv(resolve(SEJOURA_ROOT, ".env.local"));
  const trouvetouEnv  = loadEnv(resolve(TROUVETOU_ROOT, ".env.local"));

  const SEJOURA_SB_URL    = sejouraEnv.NEXT_PUBLIC_SUPABASE_URL   || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SEJOURA_SB_KEY    = sejouraEnv.SUPABASE_SERVICE_ROLE_KEY  || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TTV_SB_URL        = trouvetouEnv.TROUVETOU_SUPABASE_URL   || process.env.TROUVETOU_SUPABASE_URL;
  const TTV_SB_KEY        = trouvetouEnv.TROUVETOU_SUPABASE_SERVICE_ROLE_KEY || process.env.TROUVETOU_SUPABASE_SERVICE_ROLE_KEY;
  const TTV_PEPPER        = trouvetouEnv.TROUVETOU_API_KEY_PEPPER || process.env.TROUVETOU_API_KEY_PEPPER;
  const TTV_APP_URL       = trouvetouEnv.NEXT_PUBLIC_APP_URL       || "https://trouvetou.vercel.app";
  const SYNC_SECRET       = sejouraEnv.TROUVETOU_SYNC_SECRET       || process.env.TROUVETOU_SYNC_SECRET;

  console.log(`   Séjoura Supabase URL : ${SEJOURA_SB_URL ? "✓" : "✗ MANQUANT"}`);
  console.log(`   Trouvetou Supabase URL : ${TTV_SB_URL ? "✓" : "✗ MANQUANT"}`);
  console.log(`   Trouvetou Pepper : ${TTV_PEPPER ? "✓" : "✗ MANQUANT"}`);

  if (!TTV_SB_URL || !TTV_SB_KEY) {
    fail("Les credentials Supabase de Trouvetou sont manquants !");
    warn(`Créez le fichier : ${TROUVETOU_ROOT}/.env.local`);
    warn("Avec les variables :");
    console.log(`
   TROUVETOU_SUPABASE_URL=https://xxx.supabase.co
   TROUVETOU_SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
   TROUVETOU_API_KEY_PEPPER=<32 chars aléatoires>
   NEXT_PUBLIC_APP_URL=https://<url-trouvetou>.vercel.app
    `);

    // Générer un pepper si besoin
    const generatedPepper = randomBytes(32).toString("hex");
    warn(`Suggestion pour TROUVETOU_API_KEY_PEPPER :`);
    console.log(`   ${B}${generatedPepper}${X}`);

    console.log(`\n${B}Arrêt : remplissez ${TROUVETOU_ROOT}/.env.local et relancez.${X}`);
    process.exit(1);
  }

  if (!TTV_PEPPER) {
    const generatedPepper = randomBytes(32).toString("hex");
    fail("TROUVETOU_API_KEY_PEPPER manquant !");
    warn("Ajoutez cette ligne dans le .env.local de Trouvetou :");
    console.log(`   ${B}TROUVETOU_API_KEY_PEPPER=${generatedPepper}${X}`);
    process.exit(1);
  }

  // ────────────────────────────────────────────────────────────────────────
  step(3, "Création du provider 'Séjoura' dans Trouvetou");
  // ────────────────────────────────────────────────────────────────────────

  // Vérifier si un provider Séjoura existe déjà
  const { data: existingProviders } = await sbFetch(
    TTV_SB_URL, TTV_SB_KEY,
    "providers?name=eq.S%C3%A9joura&select=id,name,api_key_hash,category_slug"
  );

  let providerId;
  let apiKey;

  if (Array.isArray(existingProviders) && existingProviders.length > 0) {
    const existing = existingProviders[0];
    warn(`Provider "Séjoura" existe déjà (id: ${existing.id})`);
    warn("Génération d'une NOUVELLE clé API (l'ancienne sera invalidée)...");
    providerId = existing.id;

    // Générer nouvelle clé
    apiKey = generateApiKey(providerId);
    const newHash = hashApiKey(apiKey, TTV_PEPPER);

    const { ok: upOk, data: upData } = await sbFetch(
      TTV_SB_URL, TTV_SB_KEY,
      `providers?id=eq.${providerId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ api_key_hash: newHash }),
      }
    );

    if (!upOk) {
      fail("Échec de la mise à jour du hash : " + JSON.stringify(upData));
      process.exit(1);
    }
    ok("Clé API régénérée avec succès.");

  } else {
    // Résoudre l'UUID de la catégorie "hotel"
    info("Recherche de la catégorie 'hotel' dans Trouvetou...");
    const { data: cats } = await sbFetch(
      TTV_SB_URL, TTV_SB_KEY,
      "categories?select=id,slug,name&limit=20"
    );

    let categoryId = null;
    if (Array.isArray(cats) && cats.length > 0) {
      console.log("   Catégories disponibles :");
      for (const c of cats) {
        console.log(`   - ${c.slug} (${c.name}) → ${c.id}`);
      }
      // Cherche hotel, résidence, hébergement...
      const hotelCat = cats.find(c =>
        ["hotel", "hotels", "residence", "residences", "hebergement", "hébergement"]
          .includes((c.slug || "").toLowerCase())
      ) || cats[0]; // fallback: première catégorie
      categoryId = hotelCat.id;
      ok(`Catégorie retenue : "${hotelCat.slug}" (${categoryId})`);
    } else {
      fail("Aucune catégorie trouvée dans la table 'categories'.");
      warn("Vérifiez que les migrations Trouvetou ont bien été appliquées sur Supabase.");
      process.exit(1);
    }

    // Créer le provider
    providerId = randomUUID();
    apiKey = generateApiKey(providerId);
    const keyHash = hashApiKey(apiKey, TTV_PEPPER);

    const { ok: insOk, status, data: insData } = await sbFetch(
      TTV_SB_URL, TTV_SB_KEY,
      "providers",
      {
        method: "POST",
        body: JSON.stringify({
          id: providerId,
          name: "Séjoura",
          category_id: categoryId,
          api_key_hash: keyHash,
        }),
      }
    );

    if (!insOk) {
      fail(`Échec création provider (HTTP ${status}) : ${JSON.stringify(insData)}`);
      process.exit(1);
    }
    ok(`Provider "Séjoura" créé (id: ${providerId})`);
  }

  // ────────────────────────────────────────────────────────────────────────
  step(4, "Résumé — Variables à configurer sur Vercel");
  // ────────────────────────────────────────────────────────────────────────

  const syncSecret  = SYNC_SECRET || randomBytes(16).toString("hex");
  const trouvetouSyncUrl = `${TTV_APP_URL}/api/v1/sync`;

  console.log(`\n${B}${G}═══════════════════════════════════════════════════════════${X}`);
  console.log(`${B}📋 Variables à ajouter sur Vercel SÉJOURA (sejoura-lemon.vercel.app)${X}`);
  console.log(`${B}${G}═══════════════════════════════════════════════════════════${X}`);
  console.log(`
   TROUVETOU_SYNC_URL     = ${trouvetouSyncUrl}
   TROUVETOU_API_KEY      = ${apiKey}
   TROUVETOU_SYNC_SECRET  = ${syncSecret}
  `);

  console.log(`${B}${G}═══════════════════════════════════════════════════════════${X}`);
  console.log(`${B}📋 Variables à vérifier sur Vercel TROUVETOU${X}`);
  console.log(`${B}${G}═══════════════════════════════════════════════════════════${X}`);
  console.log(`
   TROUVETOU_API_KEY_PEPPER = ${TTV_PEPPER}
   SEJOURA_API_URL          = https://sejoura-lemon.vercel.app  (par défaut, aucune action)
  `);

  // Sauvegarder dans un fichier pour ne pas perdre la clé
  const outputPath = resolve(SEJOURA_ROOT, "scripts", "trouvetou-integration-keys.txt");
  writeFileSync(outputPath, `# CLÉS D'INTÉGRATION TROUVETOU — GÉNÉRÉES LE ${new Date().toISOString()}
# ⚠️  NE PAS COMMITTER CE FICHIER — il est dans .gitignore

# === Variables pour Vercel SÉJOURA ===
TROUVETOU_SYNC_URL=${trouvetouSyncUrl}
TROUVETOU_API_KEY=${apiKey}
TROUVETOU_SYNC_SECRET=${syncSecret}

# === Provider ID Trouvetou (pour référence) ===
PROVIDER_ID=${providerId}
`);

  ok(`Clés sauvegardées dans : scripts/trouvetou-integration-keys.txt`);
  warn("⚠️  Ne committez JAMAIS ce fichier !");

  // ────────────────────────────────────────────────────────────────────────
  step(5, "Test de la sync (si TROUVETOU_SYNC_SECRET déjà sur Vercel)");
  // ────────────────────────────────────────────────────────────────────────
  info("Une fois les variables ajoutées sur Vercel et le projet redéployé,");
  info("lancez la sync avec cette commande :");
  console.log(`\n   ${B}curl -X POST https://sejoura-lemon.vercel.app/api/trouvetou/sync \\`);
  console.log(`        -H "x-sync-secret: ${syncSecret}"${X}\n`);

  console.log(`${B}${G}═══════════════════════════════════════════════════════════${X}`);
  console.log(`${B}✅  Setup terminé ! Suivez les étapes ci-dessus.${X}`);
  console.log(`${B}${G}═══════════════════════════════════════════════════════════${X}\n`);
}

main().catch((err) => {
  console.error("\n💥 Erreur :", err.message);
  process.exit(1);
});
