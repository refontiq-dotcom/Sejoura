/**
 * ============================================================================
 * SÉJOURA — FACTORY DES PASSERELLES DE PAIEMENT
 * ============================================================================
 *
 * Ce fichier est le point d'entrée unique pour les paiements.
 * Il charge les clés depuis la base de données (tenant_payment_gateways)
 * et retourne le service correspondant au provider demandé.
 *
 * Usage (depuis n'importe quelle route API) :
 * ─────────────────────────────────────────────
 * const service = await getPaymentService(tenantId, "wave");
 * if (!service) throw new Error("Wave non configuré");
 *
 * const result = await service.initiatePayment({
 *   amount: 15000,
 *   reference: "SJ-2026-0001",
 *   description: "Acompte réservation Séjoura",
 *   returnUrl: "https://trouvetou.vercel.app/booking/success",
 *   cancelUrl: "https://trouvetou.vercel.app/booking/cancelled",
 *   webhookUrl: "https://sejoura-lemon.vercel.app/api/v1/webhooks/payments",
 * });
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { WavePaymentService } from "./wave";
import { OrangeMoneyPaymentService } from "./orange-money";
import { MtnPaymentService } from "./mtn";
import { MoovAfricaPaymentService } from "./moov-africa";
import { PiSpiPaymentService } from "./pi-spi";
import type { PaymentProvider } from "./types";

// ─── Providers supportés ─────────────────────────────────────────────────────

export type SupportedProvider =
  | "wave"
  | "orange_money"
  | "mtn"
  | "moov_africa"
  | "pi_spi";

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Charge le service de paiement pour un tenant et un provider donnés.
 * Retourne null si le provider n'est pas configuré ou pas actif.
 */
export async function getPaymentService(
  tenantId: string,
  provider: SupportedProvider
): Promise<PaymentProvider | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tenant_payment_gateways")
    .select("api_keys, is_active")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return null;
  }

  const keys = data.api_keys;
  const isSandbox = process.env.PAYMENT_ENV === "sandbox";

  switch (provider) {
    case "wave":
      return new WavePaymentService(keys as any, isSandbox);
    case "orange_money":
      return new OrangeMoneyPaymentService(keys as any);
    case "mtn":
      return new MtnPaymentService(keys as any, isSandbox);
    case "moov_africa":
      return new MoovAfricaPaymentService(keys as any);
    case "pi_spi":
      return new PiSpiPaymentService(keys as any);
    default:
      return null;
  }
}

/**
 * Récupère la liste des providers actifs pour un tenant.
 * Utilisé par Trouvetou pour afficher les méthodes de paiement disponibles.
 */
export async function getActiveProviders(tenantId: string): Promise<SupportedProvider[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tenant_payment_gateways")
    .select("provider")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error || !data) return [];

  return data.map((r) => r.provider as SupportedProvider);
}
