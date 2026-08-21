/**
 * ============================================================================
 * SÉJOURA — INTÉGRATION WAVE CI
 * ============================================================================
 *
 * Documentation officielle : https://developer.wave.com/docs
 * Environnement sandbox : https://api.sandbox.wave.com
 * Environnement production : https://api.wave.com
 *
 * Modèle de paiement Wave :
 * ─────────────────────────
 * 1. POST /v1/checkout/sessions → création d'une session de paiement
 *    → Retourne un `checkout_url` vers lequel rediriger le client
 * 2. Le client paie sur l'interface Wave (mobile ou USSD)
 * 3. Wave envoie un Webhook POST sur notre URL avec le statut
 * 4. Le webhook est signé avec HMAC-SHA256 (header: Wave-Signature)
 *
 * Flux de données :
 * Client → Trouvetou → Séjoura API → Wave API → (client paie) → Wave Webhook → Séjoura
 */

import crypto from "crypto";
import type {
  PaymentProvider,
  InitiatePaymentParams,
  PaymentInitResult,
  PaymentStatusResult,
  WaveApiKeys,
} from "./types";

// ─── URLs ────────────────────────────────────────────────────────────────────

const WAVE_SANDBOX_URL = "https://api.sandbox.wave.com";
const WAVE_PROD_URL = "https://api.wave.com";

// ─── Service Wave ─────────────────────────────────────────────────────────────

export class WavePaymentService implements PaymentProvider {
  private readonly apiKey: string;
  private readonly merchantId: string;
  private readonly baseUrl: string;

  constructor(keys: WaveApiKeys, sandbox = false) {
    this.apiKey = keys.api_key;
    this.merchantId = keys.merchant_id;
    this.baseUrl = sandbox ? WAVE_SANDBOX_URL : WAVE_PROD_URL;
  }

  /**
   * Crée une session de checkout Wave.
   * Endpoint : POST /v1/checkout/sessions
   *
   * Corps de la requête Wave :
   * {
   *   "currency": "XOF",
   *   "amount": "15000",                // FCFA, en STRING selon l'API Wave
   *   "error_url": "https://...",
   *   "success_url": "https://...",
   *   "payment_reason": "Acompte réservation SJ-2026-0001",
   *   "client_reference": "SJ-2026-0001"
   * }
   *
   * Réponse Wave :
   * {
   *   "id": "cos_...",                  // ID de la session (à stocker)
   *   "checkout_status": "open",
   *   "wave_launch_url": "https://pay.wave.com/m/...",
   *   "client_reference": "SJ-2026-0001"
   * }
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitResult> {
    // TODO : Décommenter quand les clés API sont disponibles
    /*
    try {
      const response = await fetch(`${this.baseUrl}/v1/checkout/sessions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currency: "XOF",
          amount: params.amount.toString(),
          error_url: params.cancelUrl,
          success_url: params.returnUrl,
          payment_reason: params.description,
          client_reference: params.reference,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || "Erreur Wave", rawResponse: data };
      }

      return {
        success: true,
        transactionId: data.id,
        checkoutUrl: data.wave_launch_url,
        rawResponse: data,
      };
    } catch (err) {
      return { success: false, error: "Erreur réseau Wave" };
    }
    */

    // 🚧 STUB — À activer quand les clés API Wave sont disponibles
    console.warn("[Wave] Service non encore connecté. Clés API manquantes.");
    return {
      success: false,
      error: "WAVE_NOT_CONFIGURED: Clés API Wave non encore renseignées dans les paramètres.",
    };
  }

  /**
   * Vérifier le statut d'une session de paiement.
   * Endpoint : GET /v1/checkout/sessions/{session_id}
   *
   * Réponse Wave :
   * {
   *   "checkout_status": "complete" | "expired" | "open",
   *   "payment_status": "succeeded" | "failed" | null,
   *   "transaction_id": "txn_..."
   * }
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    // TODO : Décommenter quand les clés API sont disponibles
    /*
    const response = await fetch(`${this.baseUrl}/v1/checkout/sessions/${transactionId}`, {
      headers: { "Authorization": `Bearer ${this.apiKey}` },
    });
    const data = await response.json();

    const statusMap: Record<string, PaymentStatusResult["status"]> = {
      succeeded: "successful",
      failed: "failed",
      expired: "expired",
    };

    return {
      status: statusMap[data.payment_status] ?? "pending",
      rawResponse: data,
    };
    */

    console.warn("[Wave] checkPaymentStatus non connecté.");
    return { status: "pending" };
  }

  /**
   * Valider la signature du webhook Wave.
   * Wave signe les webhooks avec HMAC-SHA256.
   * Header : Wave-Signature: t=timestamp,v=signature
   *
   * À configurer dans le dashboard Wave Business :
   *   Webhook URL → https://sejoura-lemon.vercel.app/api/v1/webhooks/payments
   *   Événements → checkout.session.completed, checkout.session.expired
   */
  validateWebhookSignature(payload: unknown, signature: string): boolean {
    // TODO : Décommenter quand les clés API sont disponibles
    /*
    const [tPart, vPart] = signature.split(",");
    const timestamp = tPart.replace("t=", "");
    const expectedSig = vPart.replace("v=", "");

    const signed = `${timestamp}.${JSON.stringify(payload)}`;
    const computed = crypto
      .createHmac("sha256", this.apiKey)
      .update(signed)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedSig));
    */

    console.warn("[Wave] validateWebhookSignature non connecté.");
    return false;
  }
}
