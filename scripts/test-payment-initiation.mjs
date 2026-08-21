#!/usr/bin/env node
/**
 * TEST — Initialisation de Paiement en Ligne (Wave Mock)
 * ====================================================
 * Ce script valide le flux complet d'initialisation de réservation
 * avec paiement en ligne via Wave (simulation).
 *
 * Usage :
 *   node scripts/test-payment-initiation.mjs
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
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  URL ou Clé de service Supabase manquante dans .env.local");
  process.exit(1);
}

// dynamic import of supabase-js
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log("🚀 Démarrage du test d'initialisation de paiement...");

  // 1. Trouver un tenant actif sur le plan Entreprise
  const { data: tenant, error: tErr } = await supabase
    .from("subscriptions")
    .select("tenant_id")
    .eq("plan", "entreprise")
    .limit(1)
    .maybeSingle();

  if (tErr || !tenant) {
    console.error("❌ Aucun tenant avec abonnement Entreprise trouvé pour le test.");
    return;
  }
  const tenantId = tenant.tenant_id;
  console.log(`✅ Tenant sélectionné : ${tenantId}`);

  // 2. Récupérer ou créer une clé API externe active pour ce tenant
  let { data: apiKeyRow } = await supabase
    .from("external_api_keys")
    .select("api_key")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .contains("scopes", ["bookings"])
    .limit(1)
    .maybeSingle();

  if (!apiKeyRow) {
    console.log("ℹ️ Aucune clé API active trouvée. Création d'une clé de test...");
    const testKey = `test_key_${Math.random().toString(36).substring(2, 10)}`;
    const { data: newKey, error: kErr } = await supabase
      .from("external_api_keys")
      .insert({
        tenant_id: tenantId,
        name: "Test Payment Key",
        api_key: testKey,
        scopes: ["availability", "bookings"],
        is_active: true,
      })
      .select("api_key")
      .single();

    if (kErr) {
      console.error("❌ Impossible de créer la clé API de test :", kErr);
      return;
    }
    apiKeyRow = newKey;
  }
  const apiKey = apiKeyRow.api_key;
  console.log(`✅ Clé API identifiée : ${apiKey.substring(0, 10)}...`);

  // 3. Configurer une passerelle Wave mockée pour ce tenant
  console.log("⚙️ Configuration d'une passerelle Wave fictive dans la DB...");
  const { error: gwErr } = await supabase
    .from("tenant_payment_gateways")
    .upsert({
      tenant_id: tenantId,
      provider: "wave",
      api_keys: { api_key: "mock_wave_key_1234", merchant_id: "merchant_test" },
      is_active: true,
    }, { onConflict: "tenant_id,provider" });

  if (gwErr) {
    console.error("❌ Échec lors de la configuration de la passerelle de test :", gwErr);
    return;
  }
  console.log("✅ Passerelle Wave activée en mode simulation.");

  // 4. Trouver un type de chambre actif pour ce tenant
  const { data: roomType } = await supabase
    .from("room_types")
    .select("id, name")
    .eq("accommodation_id", (
      await supabase
        .from("accommodations")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1)
        .single()
    ).data?.id)
    .limit(1)
    .single();

  if (!roomType) {
    console.error("❌ Aucun type de chambre trouvé pour cette résidence.");
    return;
  }
  console.log(`✅ Type de chambre sélectionné : ${roomType.name} (${roomType.id})`);

  // 5. Appeler l'API de création de réservation avec paiement en ligne
  console.log(`📡 Envoi de la requête à ${APP_URL}/api/v1/external/bookings...`);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);

  const payload = {
    room_type_id: roomType.id,
    check_in_date: tomorrow.toISOString().split("T")[0],
    check_out_date: dayAfter.toISOString().split("T")[0],
    number_of_guests: 1,
    guest: {
      full_name: "Test Voyageur Wave",
      phone: "+22501020304",
      email: "voyageur@example.com",
    },
    payment_method: "online",
    payment_provider: "wave",
  };

  try {
    const res = await fetch(`${APP_URL}/api/v1/external/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error(`❌ Échec de la requête (Code ${res.status}) :`, result);
      return;
    }

    console.log("\n🎉 SUCCÈS ! Réservation initiée avec paiement :");
    console.log(JSON.stringify(result, null, 2));

    // 6. Nettoyer la réservation de test
    if (result.booking?.id) {
      console.log(`\n🧹 Nettoyage de la réservation de test (${result.booking.id})...`);
      await supabase.from("bookings").delete().eq("id", result.booking.id);
      console.log("✅ Réservation supprimée.");
    }

  } catch (err) {
    console.error("❌ Impossible de contacter le serveur local. Assurez-vous que l'application tourne sur", APP_URL);
    console.error(err.message);
  }
}

run();
