"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabasePublicKey } from "./env";

/**
 * Client Supabase pour le navigateur (Client Components)
 * Utilise les variables d'environnement publiques
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublicKey());
}
