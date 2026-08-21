/**
 * ============================================================================
 * SÉJOURA — INTÉGRATION MTN MOBILE MONEY (MoMo API)
 * ============================================================================
 *
 * Documentation officielle : https://momodeveloper.mtn.com/docs
 * Portail développeur : https://momodeveloper.mtn.com
 *
 * Modèle d'authentification MTN MoMo :
 * ──────────────────────────────────────
 * MTN utilise OAuth2 avec des credentials spécifiques par produit.
 * Le produit utilisé ici est "Collection" (collecte de paiements).
 *
 * Étapes d'initialisation (à faire UNE FOIS sur le portail MTN) :
 * 1. Créer une application sur momodeveloper.mtn.com
 * 2. Souscrire au produit "Collection Sandbox"
 * 3. Récupérer la Subscription Key (Ocp-Apim-Subscription-Key)
 * 4. Créer un API User via POST /v1_0/apiuser (avec la subscription key)
 * 5. Générer un API Key via POST /v1_0/apiuser/{apiUserId}/apikey
 *
 * Flux de paiement MTN MoMo (Collection API) :
 * ─────────────────────────────────────────────
 * 1. POST /token/ → Obtenir un access_token
 * 2. POST /v1_0/requesttopay → Initier une demande de paiement
 *    → Le client reçoit une notification USSD/push sur son téléphone
 * 3. GET /v1_0/requesttopay/{referenceId} → Vérifier le statut
 *
 * NOTE : MTN MoMo n'a pas de "checkout URL". Le client est notifié
 * directement sur son téléphone. Il faut donc afficher une page
 * "En attente de confirmation" côté Trouvetou.
 */

import crypto from "crypto";
import type {
  PaymentProvider,
  InitiatePaymentParams,
  PaymentInitResult,
  PaymentStatusResult,
  MtnApiKeys,
} from "./types";

// ─── URLs par environnement ───────────────────────────────────────────────────

const MTN_SANDBOX_URL = "https://sandbox.momodeveloper.mtn.com";
const MTN_PROD_URL = "https://proxy.momoapi.mtn.com";

// ─── Service MTN MoMo ─────────────────────────────────────────────────────────

export class MtnPaymentService implements PaymentProvider {
  private readonly subscriptionKey: string;
  private readonly apiUser: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(keys: MtnApiKeys, sandbox = false) {
    this.subscriptionKey = keys.subscription_key;
    this.apiUser = keys.api_user;
    this.apiKey = keys.api_key;
    this.baseUrl = sandbox ? MTN_SANDBOX_URL : MTN_PROD_URL;
  }

  /**
   * Obtenir un token d'accès MTN MoMo.
   * Endpoint : POST /collection/token/
   *
   * Headers :
   *   Authorization: Basic base64(apiUser:apiKey)
   *   Ocp-Apim-Subscription-Key: {subscriptionKey}
   *
   * Réponse :
   * {
   *   "access_token": "eyJ...",
   *   "token_type": "access_token",
   *   "expires_in": 3600
   * }
   */
  private async getAccessToken(): Promise<string> {
    // TODO : Décommenter quand les clés API MTN sont disponibles
    /*
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.apiUser}:${this.apiKey}`).toString("base64");

    const response = await fetch(`${this.baseUrl}/collection/token/`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Ocp-Apim-Subscription-Key": this.subscriptionKey,
      },
    });

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
    */
    throw new Error("MTN_NOT_CONFIGURED");
  }

  /**
   * Initier une demande de paiement MTN MoMo.
   * Endpoint : POST /collection/v1_0/requesttopay
   *
   * Headers :
   *   Authorization: Bearer {access_token}
   *   X-Reference-Id: {uuid}           ← Généré par nous (referenceId)
   *   X-Target-Environment: sandbox | production
   *   X-Callback-Url: {webhookUrl}
   *   Ocp-Apim-Subscription-Key: {subscriptionKey}
   *
   * Corps JSON :
   * {
   *   "amount": "15000",
   *   "currency": "XOF",
   *   "externalId": "SJ-2026-0001",
   *   "payer": {
   *     "partyIdType": "MSISDN",
   *     "partyId": "2250700000000"     // Numéro du client (avec indicatif)
   *   },
   *   "payerMessage": "Acompte séjour Séjoura",
   *   "payeeNote": "Réservation SJ-2026-0001"
   * }
   *
   * Réponse : HTTP 202 (Accepted) — pas de body
   * → Le referenceId envoyé en header devient l'ID de transaction
   *
   * ⚠️ IMPORTANT : MTN ne redirige pas vers une URL externe.
   *    Le client est notifié par PUSH/USSD sur son téléphone.
   *    Il faut afficher une page "Vérifiez votre téléphone MTN" sur Trouvetou.
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitResult> {
    // TODO : Décommenter quand les clés API MTN sont disponibles
    /*
    try {
      const token = await this.getAccessToken();
      const referenceId = crypto.randomUUID();

      const response = await fetch(`${this.baseUrl}/collection/v1_0/requesttopay`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": this.baseUrl.includes("sandbox") ? "sandbox" : "production",
          "X-Callback-Url": params.webhookUrl,
          "Ocp-Apim-Subscription-Key": this.subscriptionKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: params.amount.toString(),
          currency: "XOF",
          externalId: params.reference,
          payer: {
            partyIdType: "MSISDN",
            partyId: params.customerPhone?.replace(/\D/g, "") ?? "",
          },
          payerMessage: params.description,
          payeeNote: params.reference,
        }),
      });

      if (response.status !== 202) {
        const data = await response.json().catch(() => ({}));
        return { success: false, error: "Erreur MTN MoMo", rawResponse: data };
      }

      // Pour MTN, il n'y a pas d'URL de checkout.
      // On retourne une URL interne pour afficher "Vérifiez votre téléphone"
      return {
        success: true,
        transactionId: referenceId,
        checkoutUrl: `${process.env.NEXT_PUBLIC_APP_URL}/booking/waiting?ref=${params.reference}&provider=mtn`,
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Erreur MTN" };
    }
    */

    // 🚧 STUB — À activer quand les clés API MTN sont disponibles
    console.warn("[MTN] Service non encore connecté. Clés API manquantes.");
    return {
      success: false,
      error: "MTN_NOT_CONFIGURED: Clés API MTN MoMo non encore renseignées dans les paramètres.",
    };
  }

  /**
   * Vérifier le statut d'un paiement MTN MoMo.
   * Endpoint : GET /collection/v1_0/requesttopay/{referenceId}
   *
   * Réponse :
   * {
   *   "financialTransactionId": "363440463",
   *   "externalId": "SJ-2026-0001",
   *   "amount": "15000",
   *   "currency": "XOF",
   *   "status": "SUCCESSFUL" | "FAILED" | "PENDING",
   *   "reason": {}
   * }
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    // TODO : Décommenter quand les clés API MTN sont disponibles
    /*
    const token = await this.getAccessToken();

    const response = await fetch(
      `${this.baseUrl}/collection/v1_0/requesttopay/${transactionId}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Target-Environment": this.baseUrl.includes("sandbox") ? "sandbox" : "production",
          "Ocp-Apim-Subscription-Key": this.subscriptionKey,
        },
      }
    );

    const data = await response.json();

    const statusMap: Record<string, PaymentStatusResult["status"]> = {
      SUCCESSFUL: "successful",
      FAILED: "failed",
      PENDING: "pending",
    };

    return {
      status: statusMap[data.status] ?? "pending",
      paidAmount: Number(data.amount),
      rawResponse: data,
    };
    */

    console.warn("[MTN] checkPaymentStatus non connecté.");
    return { status: "pending" };
  }

  /**
   * Valider le webhook MTN MoMo.
   * MTN envoie un POST sur X-Callback-Url avec le corps suivant :
   * {
   *   "financialTransactionId": "363440463",
   *   "externalId": "SJ-2026-0001",
   *   "status": "SUCCESSFUL" | "FAILED"
   * }
   *
   * MTN ne signe pas les webhooks par défaut.
   * Recommandation : vérifier l'IP source ou utiliser un token secret
   * passé dans l'URL du webhook (query param secret).
   */
  validateWebhookSignature(payload: unknown, signature: string): boolean {
    // TODO : Implémenter validation IP source MTN
    // IPs de production MTN : à demander à MTN lors de l'enrôlement
    console.warn("[MTN] validateWebhookSignature non implémentée.");
    return true; // ⚠️ À sécuriser en production
  }
}
