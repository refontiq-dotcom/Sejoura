/**
 * ============================================================================
 * SÉJOURA — TYPES COMMUNS DES PASSERELLES DE PAIEMENT
 * ============================================================================
 * Ce fichier définit les interfaces partagées par tous les providers.
 * Chaque provider (Wave, Orange Money, etc.) doit implémenter PaymentProvider.
 */

// ─── Interface universelle d'un provider ────────────────────────────────────

export interface PaymentProvider {
  /** Déclenche une demande de paiement et retourne l'URL de redirection client */
  initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitResult>;

  /** Vérifie le statut d'une transaction (polling ou après webhook) */
  checkPaymentStatus(transactionId: string): Promise<PaymentStatusResult>;

  /** Valide la signature d'un webhook entrant (sécurité) */
  validateWebhookSignature(payload: unknown, signature: string): boolean;
}

// ─── Paramètres d'initiation de paiement ────────────────────────────────────

export interface InitiatePaymentParams {
  /** Montant en FCFA (entier) */
  amount: number;
  /** Référence interne (booking_code) */
  reference: string;
  /** Numéro de téléphone du client (si requis par l'opérateur) */
  customerPhone?: string;
  /** Description affichée au client */
  description: string;
  /** URL de retour après paiement réussi */
  returnUrl: string;
  /** URL de retour après paiement annulé/échoué */
  cancelUrl: string;
  /** URL du webhook de notre serveur (où l'opérateur nous notifie) */
  webhookUrl: string;
}

// ─── Résultat d'initiation ───────────────────────────────────────────────────

export interface PaymentInitResult {
  /** true si l'initiation a réussi */
  success: boolean;
  /** ID de transaction côté opérateur (à stocker dans online_payment_transactions) */
  transactionId?: string;
  /** URL de paiement vers laquelle rediriger le client */
  checkoutUrl?: string;
  /** Message d'erreur si success=false */
  error?: string;
  /** Données brutes renvoyées par l'opérateur (pour logs) */
  rawResponse?: unknown;
}

// ─── Résultat de vérification de statut ─────────────────────────────────────

export interface PaymentStatusResult {
  /** Statut normalisé */
  status: "pending" | "successful" | "failed" | "expired" | "cancelled";
  /** Montant effectivement payé (si connu) */
  paidAmount?: number;
  /** Message brut de l'opérateur */
  providerMessage?: string;
  /** Données brutes (pour logs) */
  rawResponse?: unknown;
}

// ─── Clés API par provider ───────────────────────────────────────────────────

export interface WaveApiKeys {
  api_key: string;
  merchant_id: string;
}

export interface OrangeMoneyApiKeys {
  client_id: string;
  client_secret: string;
  merchant_number: string;
}

export interface MtnApiKeys {
  subscription_key: string;
  api_user: string;
  api_key: string;
}

export interface MoovAfricaApiKeys {
  api_key: string;
  merchant_code: string;
}

export interface PiSpiApiKeys {
  merchant_id: string;
  secret_key: string;
  bank_code: string;
}
