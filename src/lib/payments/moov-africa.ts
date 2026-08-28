/**
 * ============================================================================
 * SÉJOURA — INTÉGRATION MOOV AFRICA (Flooz Pay)
 * ============================================================================
 *
 * Documentation officielle : https://developer.moov-africa.com
 * Produit : Flooz Pay (anciennement Moov Money)
 * Présence : Côte d'Ivoire, Bénin, Togo, Burkina Faso, Niger, Tchad, Congo
 *
 * Modèle de paiement Moov Africa :
 * ──────────────────────────────────
 * 1. POST /api/v1/auth/token → Obtenir un token
 * 2. POST /api/v1/payment/init → Initier un paiement
 *    → Le client reçoit une notification USSD sur son téléphone Moov
 * 3. GET /api/v1/payment/status/{transactionId} → Vérifier le statut
 *
 * NOTE : Moov Africa est en cours de standardisation de son API.
 * La documentation ci-dessous est basée sur l'API Flooz Pay publique.
 * Il est fortement recommandé de contacter Moov Africa CI pour obtenir
 * les spécifications exactes et les IPs à whitelister.
 *
 * Contact Moov Africa CI (Marchands) : marchands@moov-africa.ci
 */

import type {
  PaymentProvider,
  InitiatePaymentParams,
  PaymentInitResult,
  PaymentStatusResult,
  MoovAfricaApiKeys,
} from "./types";

// ─── URLs ────────────────────────────────────────────────────────────────────

const MOOV_API_URL = "https://api.flooz.moov-africa.com"; // URL à confirmer avec Moov

// ─── Service Moov Africa ──────────────────────────────────────────────────────

export class MoovAfricaPaymentService implements PaymentProvider {
  private readonly apiKey: string;
  private readonly merchantCode: string;

  constructor(keys: MoovAfricaApiKeys) {
    this.apiKey = keys.api_key;
    this.merchantCode = keys.merchant_code;
  }

  /**
   * Initier un paiement Moov Africa (Flooz Pay).
   * Endpoint (estimé) : POST /api/v1/payment/init
   *
   * Headers :
   *   Authorization: Bearer {api_key}
   *   Content-Type: application/json
   *
   * Corps JSON (à valider avec la doc officielle Moov) :
   * {
   *   "merchant_code": "MCH_XXXX",
   *   "amount": 15000,
   *   "currency": "XOF",
   *   "order_id": "RES-26-0001",
   *   "customer_phone": "0100000000",  // Numéro Moov du client
   *   "description": "Acompte séjour",
   *   "callback_url": "https://sejoura.../webhook",
   *   "return_url": "https://trouvetou.../booking/success"
   * }
   *
   * ⚠️ IMPORTANT : L'API Moov Africa est similaire à MTN (push USSD).
   *    Il n'y a pas de page web de paiement — le client valide depuis son téléphone.
   *    Afficher "Vérifiez votre téléphone Moov" sur Trouvetou.
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitResult> {
    // TODO : Décommenter quand les clés API Moov Africa sont disponibles
    /*
    try {
      const response = await fetch(`${MOOV_API_URL}/api/v1/payment/init`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchant_code: this.merchantCode,
          amount: params.amount,
          currency: "XOF",
          order_id: params.reference,
          customer_phone: params.customerPhone,
          description: params.description,
          callback_url: params.webhookUrl,
          return_url: params.returnUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message ?? "Erreur Moov Africa", rawResponse: data };
      }

      return {
        success: true,
        transactionId: data.transaction_id,
        checkoutUrl: `${process.env.NEXT_PUBLIC_APP_URL}/booking/waiting?ref=${params.reference}&provider=moov_africa`,
        rawResponse: data,
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Erreur Moov Africa" };
    }
    */

    // 🚧 STUB — À activer quand les clés API Moov Africa sont disponibles
    console.warn("[MoovAfrica] Service non encore connecté. Clés API manquantes.");
    return {
      success: false,
      error: "MOOV_NOT_CONFIGURED: Clés API Moov Africa non encore renseignées dans les paramètres.",
    };
  }

  /**
   * Vérifier le statut d'un paiement Moov Africa.
   * Endpoint (estimé) : GET /api/v1/payment/status/{transactionId}
   *
   * Réponse attendue :
   * {
   *   "status": "SUCCESS" | "FAILED" | "PENDING",
   *   "transaction_id": "TXN_XXXX",
   *   "amount": 15000
   * }
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    // TODO : Décommenter quand les clés API Moov Africa sont disponibles
    /*
    const response = await fetch(`${MOOV_API_URL}/api/v1/payment/status/${transactionId}`, {
      headers: { "Authorization": `Bearer ${this.apiKey}` },
    });
    const data = await response.json();

    const statusMap: Record<string, PaymentStatusResult["status"]> = {
      SUCCESS: "successful",
      FAILED: "failed",
      PENDING: "pending",
    };

    return {
      status: statusMap[data.status] ?? "pending",
      paidAmount: data.amount,
      rawResponse: data,
    };
    */

    console.warn("[MoovAfrica] checkPaymentStatus non connecté.");
    return { status: "pending" };
  }

  /**
   * Valider le webhook Moov Africa.
   * Moov Africa envoie un POST sur callback_url.
   * La validation exacte est à confirmer avec la documentation officielle.
   *
   * Corps du webhook attendu :
   * {
   *   "transaction_id": "TXN_XXXX",
   *   "order_id": "RES-26-0001",
   *   "status": "SUCCESS" | "FAILED",
   *   "amount": 15000
   * }
   */
  validateWebhookSignature(payload: unknown, signature: string): boolean {
    // TODO : Implémenter selon la documentation Moov Africa
    // Contacter marchands@moov-africa.ci pour les détails de sécurité
    console.warn("[MoovAfrica] validateWebhookSignature non implémentée.");
    return true; // ⚠️ À sécuriser en production
  }
}
