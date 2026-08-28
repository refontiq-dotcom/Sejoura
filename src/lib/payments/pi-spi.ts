/**
 * ============================================================================
 * SÉJOURA — INTÉGRATION PI-SPI (BCEAO)
 * ============================================================================
 *
 * PI-SPI = Plateforme Interbancaire de Services de Paiement Interopérables
 * Émetteur : BCEAO (Banque Centrale des États de l'Afrique de l'Ouest)
 * Zone : UEMOA (8 pays : CI, SN, ML, BF, BJ, NE, TG, GW)
 *
 * Présentation :
 * ──────────────
 * PI-SPI est le système de paiement interbancaire interopérable de la zone UEMOA.
 * Il permet des paiements entre différentes banques et opérateurs de la zone,
 * quel que soit l'opérateur utilisé (Wave, Orange Money, MTN, banques...).
 *
 * ⚠️ PARTICULARITÉ IMPORTANTE :
 * PI-SPI n'a pas d'API publique directe pour les marchands.
 * L'accès se fait OBLIGATOIREMENT via une banque partenaire habilitée BCEAO.
 * 
 * Banques partenaires PI-SPI en Côte d'Ivoire (liste non exhaustive) :
 * - BNI-CI (Banque Nationale d'Investissement)
 * - SIB (Société Ivoirienne de Banque)
 * - SGBCI (Société Générale Côte d'Ivoire)
 * - BOA CI (Bank of Africa)
 * - Bridge Bank
 *
 * Processus d'enrôlement :
 * ─────────────────────────
 * 1. Contacter votre banque partenaire (ex: BNI-CI)
 * 2. Signer une convention marchand PI-SPI
 * 3. Recevoir un Merchant_ID, une clé secrète et la documentation API
 * 4. La banque vous fournit les endpoints de leur passerelle PI-SPI
 *
 * Flux de paiement (via banque partenaire) :
 * ─────────────────────────────────────────
 * 1. POST /pispi/payment/init → Créer une session de paiement
 * 2. Rediriger le client vers la page de paiement PI-SPI (multi-opérateurs)
 * 3. Le client choisit son mode de paiement (Wave, OM, MTN, virement...)
 * 4. La banque envoie un webhook avec le statut final
 *
 * Contact BCEAO : https://www.bceao.int/fr/content/pi-spi
 */

import crypto from "crypto";
import type {
  PaymentProvider,
  InitiatePaymentParams,
  PaymentInitResult,
  PaymentStatusResult,
  PiSpiApiKeys,
} from "./types";

// ─── Service PI-SPI ───────────────────────────────────────────────────────────

export class PiSpiPaymentService implements PaymentProvider {
  private readonly merchantId: string;
  private readonly secretKey: string;
  private readonly bankCode: string;
  // L'URL de l'API dépend de la banque partenaire (à configurer dans les clés API)
  private readonly apiBaseUrl: string;

  constructor(keys: PiSpiApiKeys) {
    this.merchantId = keys.merchant_id;
    this.secretKey = keys.secret_key;
    this.bankCode = keys.bank_code;

    // Les endpoints PI-SPI varient par banque partenaire.
    // Exemples (à confirmer avec chaque banque) :
    const bankUrls: Record<string, string> = {
      "BNI-CI": "https://paiement.bni.ci/pispi",
      SIB: "https://payment.sib.ci/pispi",
      SGBCI: "https://paiement.sgbci.ci/pispi",
      BOA: "https://payment.boaci.com/pispi",
    };

    this.apiBaseUrl = bankUrls[this.bankCode] ?? "https://votre-banque.ci/pispi";
  }

  /**
   * Générer une signature HMAC-SHA256 pour sécuriser les requêtes PI-SPI.
   * La plupart des banques demandent une signature sur les données envoyées.
   *
   * Format de signature typique PI-SPI :
   * HMAC-SHA256(merchantId + amount + reference + timestamp, secretKey)
   */
  private generateSignature(data: Record<string, string | number>): string {
    const payload = Object.values(data).join("|");
    return crypto.createHmac("sha256", this.secretKey).update(payload).digest("hex");
  }

  /**
   * Initier un paiement PI-SPI via la banque partenaire.
   * Endpoint (estimé, varie par banque) : POST /pispi/payment/init
   *
   * Corps JSON typique PI-SPI :
   * {
   *   "merchant_id": "PISPI_XXXXXXXXXXXX",
   *   "amount": 15000,
   *   "currency": "XOF",
   *   "reference": "RES-26-0001",
   *   "description": "Acompte réservation Séjoura",
   *   "return_url": "https://trouvetou.../booking/success",
   *   "cancel_url": "https://trouvetou.../booking/cancelled",
   *   "notify_url": "https://sejoura.../api/v1/webhooks/payments",
   *   "timestamp": 1724158200,
   *   "signature": "HMAC_SHA256_xxx"   // Signé avec la clé secrète
   * }
   *
   * Avantage PI-SPI : Le client arrive sur une PAGE UNIFIÉE qui lui
   * propose TOUS les modes de paiement disponibles (Wave, OM, MTN, virement).
   * C'est la solution la plus inclusive de la zone UEMOA.
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitResult> {
    // TODO : Décommenter et adapter selon les specs de votre banque partenaire
    /*
    try {
      const timestamp = Math.floor(Date.now() / 1000);

      const signature = this.generateSignature({
        merchant_id: this.merchantId,
        amount: params.amount,
        reference: params.reference,
        timestamp,
      });

      const response = await fetch(`${this.apiBaseUrl}/payment/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-Id": this.merchantId,
          "X-Timestamp": timestamp.toString(),
          "X-Signature": signature,
        },
        body: JSON.stringify({
          merchant_id: this.merchantId,
          amount: params.amount,
          currency: "XOF",
          reference: params.reference,
          description: params.description,
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
          notify_url: params.webhookUrl,
          timestamp,
          signature,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.payment_url) {
        return { success: false, error: data.message ?? "Erreur PI-SPI", rawResponse: data };
      }

      return {
        success: true,
        transactionId: data.transaction_id,
        checkoutUrl: data.payment_url,
        rawResponse: data,
      };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Erreur PI-SPI" };
    }
    */

    // 🚧 STUB — À activer quand les clés API PI-SPI sont disponibles
    // ⚠️ Rappel : Contacter votre banque partenaire BCEAO pour l'enrôlement
    console.warn("[PI-SPI] Service non encore connecté. Enrôlement banque partenaire requis.");
    return {
      success: false,
      error: "PISPI_NOT_CONFIGURED: Enrôlement PI-SPI via banque partenaire non encore effectué.",
    };
  }

  /**
   * Vérifier le statut d'un paiement PI-SPI.
   * Endpoint (estimé) : GET /pispi/payment/status/{transactionId}
   *
   * Réponse attendue :
   * {
   *   "transaction_id": "PISPI_XXXX",
   *   "status": "SUCCESS" | "FAILED" | "PENDING",
   *   "amount": 15000,
   *   "payment_method": "wave" | "orange_money" | "bank_transfer"
   * }
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    // TODO : Décommenter quand les clés API PI-SPI sont disponibles
    /*
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.generateSignature({ transaction_id: transactionId, timestamp });

    const response = await fetch(
      `${this.apiBaseUrl}/payment/status/${transactionId}`,
      {
        headers: {
          "X-Merchant-Id": this.merchantId,
          "X-Timestamp": timestamp.toString(),
          "X-Signature": signature,
        },
      }
    );
    const data = await response.json();

    const statusMap: Record<string, PaymentStatusResult["status"]> = {
      SUCCESS: "successful",
      FAILED: "failed",
      PENDING: "pending",
    };

    return {
      status: statusMap[data.status] ?? "pending",
      paidAmount: data.amount,
      providerMessage: data.payment_method,
      rawResponse: data,
    };
    */

    console.warn("[PI-SPI] checkPaymentStatus non connecté.");
    return { status: "pending" };
  }

  /**
   * Valider la signature du webhook PI-SPI.
   * La banque partenaire envoie un POST signé sur notify_url.
   *
   * Corps du webhook typique PI-SPI :
   * {
   *   "transaction_id": "PISPI_XXXX",
   *   "reference": "RES-26-0001",
   *   "status": "SUCCESS" | "FAILED",
   *   "amount": 15000,
   *   "timestamp": 1724158200,
   *   "signature": "HMAC_SHA256_xxx"
   * }
   *
   * Validation : recalculer la signature et la comparer à celle reçue.
   */
  validateWebhookSignature(payload: unknown, signature: string): boolean {
    // TODO : Décommenter quand les specs de signature de la banque sont connues
    /*
    const p = payload as Record<string, string | number>;
    const expectedSignature = this.generateSignature({
      transaction_id: p.transaction_id,
      reference: p.reference,
      amount: p.amount,
      timestamp: p.timestamp,
    });

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
    */

    console.warn("[PI-SPI] validateWebhookSignature non implémentée.");
    return true; // ⚠️ À sécuriser en production
  }
}
