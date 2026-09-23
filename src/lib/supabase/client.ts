"use client";

import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabasePublicKey } from "./env";

/**
 * Client Supabase navigateur singleton.
 *
 * Évite de recréer un client et ses listeners de session à chaque rendu/action
 * d'un Client Component. Toutes les pages partagent la même instance.
 */
let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublicKey());
  }
  return browserClient;
}
