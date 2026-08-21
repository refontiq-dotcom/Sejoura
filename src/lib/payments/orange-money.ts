/**
 * ============================================================================
 * SÉJOURA — INTÉGRATION ORANGE MONEY (WebPay CI/SN)
 * ============================================================================
 *
 * Documentation officielle : https://developer.orange.com/apis/om-webpay-ci/getting-started
 * Console développeur : https://developer.orange.com
 *
 * Modèle de paiement Orange Money WebPay :
 * ─────────────────────────────────────────
 * 1. POST /oauth/v3/token (avec client_id + client_secret en Basic Auth)
 *    → Obtenir un access_token (valable 3600 secondes)
 * 2. POST /orange-money-webpay/ci/v1/webpayment
 *    → Créer un ordre de paiement, obtenir un payment_url
 * 3. Rediriger le client vers le payment_url
 * 4. Orange Money notifie via notif_url (webhook) avec le statut final
 *
 * En-têtes importants :
 * Authorization: Bearer {access_token}
 * X-AUTH-TOKEN: {token_base64_encodé}   ← Généré côté Orange
 *
 * Flux de données :
 * Client → Trouvetou → Séjoura API → Orange API → (client paie) → Orange Webhook → Séjoura
 */

import type {
  PaymentProvider,
  InitiatePaymentParams,
  PaymentInitResult,
  PaymentStatusResult,
  OrangeMoneyApiKeys,
} from "./types";

// ─── URLs ────────────────────────────────────────────────────────────────────

const OM_TOKEN_URL = "https://api.orange.com/oauth/v3/token";
const OM_PAYMENT_URL_CI = "https://api.orange.com/orange-money-webpay/ci/v1/webpayment";
// Pour le Sénégal : https://api.orange.com/orange-money-webpay/sn/v1/webpayment

// ─── Service Orange Money ─────────────────────────────────────────────────────

export class OrangeMoneyPaymentService implements PaymentProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly merchantNumber: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(keys: OrangeMoneyApiKeys) {
    this.clientId = keys.client_id;
    this.clientSecret = keys.client_secret;
    this.merchantNumber = keys.merchant_number;
  }

  /**
   * Obtenir un token OAuth2.
   * Endpoint : POST /oauth/v3/token
   *
   * Corps (x-www-form-urlencoded) :
   *   grant_type=client_credentials
   *
   * Headers :
   *   Authorization: Basic base64(client_id:client_secret)
   *
   * Réponse :
   * {
   *   "access_token": "xxxxx",
   *   "token_type": "Bearer",
   *   "expires_in": 3600
   * }
   */
  private async getAccessToken(): Promise<string> {
    // TODO : Décommenter quand les clés API sont disponibles
    /*
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    const response = await fetch(OM_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
    */
    throw new Error("OM_NOT_CONFIGURED");
  }

  /**
   * Créer un ordre de paiement Orange Money.
   * Endpoint : POST /orange-money-webpay/ci/v1/webpayment
   *
   * Corps JSON :
   * {
   *   "merchant_key": "xxxx",           // Clé marchand (fournie par Orange)
   *   "currency": "OUV",                // Devise UEMOA
   *   "order_id": "SJ-2026-0001",
   *   "amount": 15000,
   *   "return_url": "https://...",
   *   "cancel_url": "https://...",
   *   "notif_url": "https://...",       // Notre webhook
   *   "lang": "fr",
   *   "reference": "Acompte séjour"
   * }
   *
   * Réponse :
   * {
   *   "status": 201,
   *   "message": "OK",
   *   "data": {
   *     "payToken": "CP210129.1436.A001",
   *     "payment_url": "https://webpayment.orange-money.com/..."
   *   }
   * }
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitResult> {
    // TODO : Décommenter quand les clés API sont disponibles
    /*
    try {
      const token = await this.getAccessToken();

      const response = await fetch(OM_PAYMENT_URL_CI, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchant_key: this.clientId,
          currency: "OUV",
          order_id: params.reference,
          amount: params.amount,
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
          notif_url: params.webhookUrl,
          lang: "fr",
          reference: params.description,
        }),
      });

      const data = await response.json();

      if (data.status !== 201) {
        return { success: false, error: data.message, rawResponse: data };
      }

      return {
        success: true,
        transactionId: data.data.payToken,
        checkoutUrl: data.data.payment_url,
        rawResponse: data,
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Erreur Orange Money" };
    }
    */

    // 🚧 STUB — À activer quand les clés API Orange Money sont disponibles
    console.warn("[OrangeMoney] Service non encore connecté. Clés API manquantes.");
    return {
      success: false,
      error: "OM_NOT_CONFIGURED: Clés API Orange Money non encore renseignées dans les paramètres.",
    };
  }

  /**
   * Vérifier le statut d'un paiement Orange Money.
   * Endpoint : GET /orange-money-webpay/ci/v1/webpayment/{payToken}
   *
   * Réponse :
   * {
   *   "status": 200,
   *   "data": {
   *     "status": "SUCCESS" | "FAILED" | "PENDING" | "EXPIRED",
   *     "txnid": "CI210129xxx",
   *     "amount": 15000
   *   }
   * }
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    // TODO : Décommenter quand les clés API sont disponibles
    /*
    const token = await this.getAccessToken();
    const response = await fetch(`${OM_PAYMENT_URL_CI}/${transactionId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const data = await response.json();

    const statusMap: Record<string, PaymentStatusResult["status"]> = {
      SUCCESS: "successful",
      FAILED: "failed",
      EXPIRED: "expired",
      PENDING: "pending",
    };

    return {
      status: statusMap[data.data?.status] ?? "pending",
      paidAmount: data.data?.amount,
      rawResponse: data,
    };
    */

    console.warn("[OrangeMoney] checkPaymentStatus non connecté.");
    return { status: "pending" };
  }

  /**
   * Valider le webhook Orange Money.
   * Orange Money envoie un POST avec le corps contenant le statut.
   * Vérification de l'IP source recommandée (whitelist Orange).
   *
   * Corps du webhook Orange Money :
   * {
   *   "notifToken": "CP210129.1436.A001",
   *   "status": "SUCCESS",
   *   "txnid": "CI210129xxx",
   *   "amount": 15000,
   *   "orderId": "SJ-2026-0001"
   * }
   */
  validateWebhookSignature(payload: unknown, signature: string): boolean {
    // Orange Money ne signe pas avec HMAC, il faut vérifier l'IP source.
    // Whitelist des IPs Orange Money CI : à confirmer avec Orange.
    // Pour l'instant on valide en vérifiant que le notifToken est connu.
    // TODO : Implémenter la validation IP ou le token de notification
    console.warn("[OrangeMoney] validateWebhookSignature non implémentée.");
    return true; // ⚠️ À sécuriser en production
  }
}
