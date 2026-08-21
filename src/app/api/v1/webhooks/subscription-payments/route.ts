/**
 * ============================================================================
 * SÉJOURA — WEBHOOK : PAIEMENTS AUTOMATIQUES D'ABONNEMENTS
 * ============================================================================
 *
 * Route : POST /api/v1/webhooks/subscription-payments
 *
 * Appelée par les opérateurs (Wave, Orange Money, MTN...)
 * après confirmation du paiement d'un abonnement Séjoura.
 *
 * ⚠️  MÉTHODE ACTUELLE INCHANGÉE :
 * La validation manuelle via /api/subscription/notify-payment reste active.
 * Cette route est additionnelle et ne la remplace pas.
 */

import { NextRequest, NextResponse } from "next/server";
import { processSubscriptionPaymentWebhook } from "@/lib/payments/subscription-payment";

// Mappage des statuts par opérateur
const STATUS_MAP: Record<string, Record<string, string>> = {
  wave: {
    complete: "successful",
    expired: "expired",
    open: "pending",
  },
  orange_money: {
    SUCCESS: "successful",
    FAILED: "failed",
    EXPIRED: "expired",
    PENDING: "pending",
  },
  mtn: {
    SUCCESSFUL: "successful",
    FAILED: "failed",
    PENDING: "pending",
  },
  moov_africa: {
    SUCCESS: "successful",
    FAILED: "failed",
    PENDING: "pending",
  },
  pi_spi: {
    SUCCESS: "successful",
    FAILED: "failed",
    PENDING: "pending",
  },
};

export async function POST(req: NextRequest) {
  try {
    // Identifier le provider via le header ou query param
    const provider =
      req.headers.get("x-payment-provider") ??
      req.nextUrl.searchParams.get("provider") ??
      "unknown";

    const rawBody = await req.json();

    // Extraire le transaction ID selon le provider
    let transactionId: string | null = null;
    let providerStatus: string | null = null;

    switch (provider) {
      case "wave":
        transactionId = rawBody.id ?? rawBody.client_reference;
        providerStatus = rawBody.checkout_status;
        break;
      case "orange_money":
        transactionId = rawBody.notifToken ?? rawBody.payToken;
        providerStatus = rawBody.status;
        break;
        case "mtn":
        transactionId = rawBody.financialTransactionId ?? rawBody.externalId;
        providerStatus = rawBody.status;
        break;
      case "moov_africa":
        transactionId = rawBody.transaction_id;
        providerStatus = rawBody.status;
        break;
      case "pi_spi":
        transactionId = rawBody.transaction_id;
        providerStatus = rawBody.status;
        break;
      default:
        return NextResponse.json({ error: "Provider inconnu" }, { status: 400 });
    }

    if (!transactionId || !providerStatus) {
      return NextResponse.json(
        { error: "Données webhook invalides" },
        { status: 400 }
      );
    }

    // Normaliser le statut
    const normalizedStatus =
      STATUS_MAP[provider]?.[providerStatus] ?? providerStatus;

    // Traiter le paiement
    const result = await processSubscriptionPaymentWebhook(
      provider,
      transactionId,
      normalizedStatus
    );

    return NextResponse.json(result, { status: result.success ? 200 : 202 });
  } catch (error) {
    console.error("[SubWebhook] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}

// Les webhooks ne doivent pas être mis en cache
export const dynamic = "force-dynamic";
