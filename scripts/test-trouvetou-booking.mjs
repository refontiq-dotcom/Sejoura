#!/usr/bin/env node
/**
 * DIAGNOSTIC EN LECTURE SEULE — Intégration Trouvetou → Séjoura
 * =============================================
 * Ce script vérifie la configuration et la disponibilité sans créer,
 * modifier ni annuler aucune réservation.
 *
 * Usage :
 *   node scripts/test-trouvetou-booking.mjs
 *
 * Variables lues depuis .env.local :
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TROUVETOU_BOOKING_SHARED_SECRET (pour la disponibilité partenaire)
 *   SEJOURA_PROD_URL  (optionnel, ex: https://app.sejoura.com)
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Charger .env.local ──────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) {
    console.error("❌  .env.local introuvable :", envPath);
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const BOOKING_SECRET = process.env.TROUVETOU_BOOKING_SHARED_SECRET;
const APP_URL =
  process.env.SEJOURA_PROD_URL ||
  (process.env.NEXT_PUBLIC_APP_URL?.includes("localhost")
    ? "https://sejoura-lemon.vercel.app"
    : process.env.NEXT_PUBLIC_APP_URL) ||
  "https://sejoura-lemon.vercel.app";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local");
  process.exit(1);
}

// ── Helper Supabase REST ────────────────────────────────────────────────────
async function sbFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, data: json };
}

// ── Helper API Séjoura ──────────────────────────────────────────────────────
async function sejouraFetch(path, opts = {}) {
  const url = `${APP_URL}${path}`;
  console.log(`   → ${opts.method || "GET"} ${url}`);
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { ok: res.ok, status: res.status, data: json };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

// ── Couleurs console ────────────────────────────────────────────────────────
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m";
const ok   = (m) => console.log(`${G}  ✅  ${m}${X}`);
const fail = (m) => console.log(`${R}  ❌  ${m}${X}`);
const warn = (m) => console.log(`${Y}  ⚠️   ${m}${X}`);
const info = (m) => console.log(`${C}  ℹ️   ${m}${X}`);
const step = (n, m) => console.log(`\n${B}${C}── Étape ${n} : ${m}${X}`);

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${B}╔══════════════════════════════════════════════════════╗`);
  console.log(`║  DIAGNOSTIC — Intégration Trouvetou → Séjoura        ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${X}`);
  console.log(`   Supabase : ${SUPABASE_URL}`);
  console.log(`   App URL  : ${APP_URL}`);

  let apiKey     = null;
  let tenantId   = null;
  let roomTypeId = null;

  // ────────────────────────────────────────────────────────────────────────
  step(1, "Clés API actives dans external_api_keys");
  // ────────────────────────────────────────────────────────────────────────
  const { ok: keysOk, data: keys } = await sbFetch(
    "external_api_keys?is_active=eq.true&select=id,tenant_id,api_key,scopes&limit=20"
  );

  if (!keysOk || !Array.isArray(keys) || keys.length === 0) {
    fail("Aucune clé API active trouvée dans external_api_keys.");
    warn("Sans clé API active, Trouvetou ne peut pas créer de réservation.");
    if (!Array.isArray(keys)) console.log("   Réponse brute :", keys);
  } else {
    ok(`${keys.length} clé(s) API active(s).`);
    for (const k of keys) {
      const scopes     = Array.isArray(k.scopes) ? k.scopes : [];
      const hasBooking = scopes.includes("bookings");
      const displayKey = k.api_key ? `${k.api_key.slice(0, 10)}...` : "(vide)";
      console.log(`\n   📋 tenant_id : ${k.tenant_id}`);
      console.log(`      api_key   : ${displayKey}`);
      console.log(`      scopes    : [${scopes.join(", ")}]`);
      if (hasBooking) {
        ok(`scope "bookings" présent ✓`);
        if (!apiKey) { apiKey = k.api_key; tenantId = k.tenant_id; }
      } else {
        fail(`scope "bookings" MANQUANT → HTTP 403 garanti pour toute réservation`);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  step(2, "Plan d'abonnement");
  // ────────────────────────────────────────────────────────────────────────
  if (!tenantId) {
    warn("Aucun tenant avec scope 'bookings' — étape ignorée.");
  } else {
    const { data: subs } = await sbFetch(
      `subscriptions?tenant_id=eq.${tenantId}&select=plan,status&limit=5`
    );
    if (!Array.isArray(subs) || subs.length === 0) {
      fail(`Aucun abonnement pour tenant ${tenantId}`);
    } else {
      for (const sub of subs) {
        console.log(`   📋 plan : ${sub.plan}  |  status : ${sub.status}`);
        if (sub.plan === "entreprise") {
          ok(`Plan "entreprise" ✓ — API externe autorisée.`);
        } else {
          fail(`Plan "${sub.plan}" → POST /api/v1/external/bookings retourne HTTP 403 !`);
          warn(`La résidence doit être sur le plan "entreprise" pour recevoir des réservations Trouvetou.`);
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  step(3, "Chambres listées sur Trouvetou");
  // ────────────────────────────────────────────────────────────────────────
  if (!tenantId) {
    warn("Pas de tenant — étape ignorée.");
  } else {
    const { data: accs } = await sbFetch(
      `accommodations?tenant_id=eq.${tenantId}&is_active=eq.true&select=id,name,city&limit=5`
    );
    if (!Array.isArray(accs) || accs.length === 0) {
      fail("Aucun établissement actif pour ce tenant.");
    } else {
      ok(`${accs.length} établissement(s) actif(s).`);
      const acc = accs[0];
      console.log(`   📋 Établissement : ${acc.name} (${acc.city || "?"})`);

      const { data: rts } = await sbFetch(
        `room_types?accommodation_id=eq.${acc.id}&is_listed_on_trouvetou=eq.true&select=id,name,base_price&limit=5`
      );
      if (!Array.isArray(rts) || rts.length === 0) {
        fail("Aucun type de chambre avec is_listed_on_trouvetou=true.");
        warn("Aucun type de chambre n'est actuellement publié vers Trouvetou.");
      } else {
        ok(`${rts.length} type(s) listés sur Trouvetou.`);
        for (const rt of rts) {
          console.log(`   📋 ${rt.name} — ${rt.base_price} XOF (id: ${rt.id})`);
        }
        roomTypeId = rts[0].id;

        const { data: rooms } = await sbFetch(
          `rooms?room_type_id=eq.${roomTypeId}&select=id,status&limit=10`
        );
        if (!Array.isArray(rooms) || rooms.length === 0) {
          fail(`Aucune chambre physique pour ce type (room_type_id=${roomTypeId}).`);
        } else {
          const dispo = rooms.filter(r => r.status !== "occupied");
          ok(`${rooms.length} chambre(s) physique(s), ${dispo.length} disponible(s).`);
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  step(4, "Test GET /api/v1/external/availability");
  // ────────────────────────────────────────────────────────────────────────
  if (!apiKey) {
    warn("Pas de clé API — test ignoré.");
  } else {
    const res = await sejouraFetch("/api/v1/external/availability", {
      headers: { "x-api-key": apiKey },
    });
    console.log(`   Status : HTTP ${res.status}`);
    if (res.ok) {
      ok(`Authentification OK.`);
      console.log(`   Tenant : ${res.data?.tenantId}`);
      console.log(`   Scopes : ${JSON.stringify(res.data?.scopes)}`);
    } else {
      fail(`HTTP ${res.status} — ${res.data?.error || JSON.stringify(res.data)}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  step(5, "Vérification de disponibilité partenaire (lecture seule)");
  // ────────────────────────────────────────────────────────────────────────
  if (!roomTypeId || !BOOKING_SECRET) {
    warn("room_type_id ou TROUVETOU_BOOKING_SHARED_SECRET manquant — vérification ignorée.");
  } else {
    const d1 = new Date(); d1.setDate(d1.getDate() + 30);
    const d2 = new Date(d1); d2.setDate(d2.getDate() + 2);
    const checkIn = d1.toISOString().slice(0, 10);
    const checkOut = d2.toISOString().slice(0, 10);
    const query = new URLSearchParams({ room_type_id: roomTypeId, check_in: checkIn, check_out: checkOut });
    const res = await sejouraFetch(`/api/v1/external/availability?${query.toString()}`, {
      headers: { "x-trouvetou-booking-secret": BOOKING_SECRET },
    });
    console.log(`   Status : HTTP ${res.status}`);
    if (res.ok) {
      ok("Endpoint partenaire accessible ; aucune réservation n'a été créée.");
      console.log(`   Disponibilité : ${res.data?.available ? "oui" : "non"}`);
      console.log(`   Chambres libres : ${res.data?.available_rooms ?? 0}`);
    } else {
      fail(`HTTP ${res.status} — ${res.data?.error || JSON.stringify(res.data)}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log(`\n${B}${C}═══════════════════════════════════════════════════════${X}`);
  console.log(`${B}Fin du diagnostic.${X}\n`);
}

main().catch((err) => {
  console.error("\n💥 Erreur inattendue :", err.message);
  process.exit(1);
});
