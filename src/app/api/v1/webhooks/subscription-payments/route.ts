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
 * ⚠️  Sécurité : la signature Wave est vérifiée. Pour les autres
 * providers, un header x-webhook-secret est requis si WEBHOOK_SECRET
 * est configuré.
 */

import { NextRequest, NextResponse } from "next/server";
import { processSubscriptionPaymentWebhook } from "@/lib/payments/subscription-payment";
import { verifyWaveSignature } from "@/lib/wave";

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
    const provider =
      req.headers.get("x-payment-provider") ??
      req.nextUrl.searchParams.get("provider") ??
      "unknown";

    const rawBody = await req.text();

    // ── Vérification de la signature ──────────────────────────────────────────
    if (provider === "wave") {
      const waveSignature = req.headers.get("wave-signature");
      const waveSecret = process.env.WAVE_WEBHOOK_SECRET;

      if (!waveSecret) {
        console.error("[SubWebhook] WAVE_WEBHOOK_SECRET non configuré");
        return NextResponse.json({ error: "Configuration manquante" }, { status: 500 });
      }

      if (!waveSignature) {
        console.error("[SubWebhook] Signature Wave manquante");
        return NextResponse.json({ error: "Signature manquante" }, { status: 401 });
      }

      const isValid = verifyWaveSignature(rawBody, waveSignature, waveSecret);
      if (!isValid) {
        console.error("[SubWebhook] Signature Wave invalide");
        return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
      }
    } else {
      // Pour les autres providers : secret partagé obligatoire si configuré
      const webhookSecret = process.env.WEBHOOK_SECRET;
      if (webhookSecret) {
        const providedSecret = req.headers.get("x-webhook-secret");
        if (providedSecret !== webhookSecret) {
          return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
        }
      }
    }

    // Parser le payload après vérification de signature
    const rawBodyForParse = rawBody;
    const body = JSON.parse(rawBodyForParse);

    // Extraire le transaction ID selon le provider
    let transactionId: string | null = null;
    let providerStatus: string | null = null;

    switch (provider) {
      case "wave":
        transactionId = body.id ?? body.client_reference;
        providerStatus = body.checkout_status;
        break;
      case "orange_money":
        transactionId = body.notifToken ?? body.payToken;
        providerStatus = body.status;
        break;
      case "mtn":
        transactionId = body.financialTransactionId ?? body.externalId;
        providerStatus = body.status;
        break;
      case "moov_africa":
        transactionId = body.transaction_id;
        providerStatus = body.status;
        break;
      case "pi_spi":
        transactionId = body.transaction_id;
        providerStatus = body.status;
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

    const normalizedStatus =
      STATUS_MAP[provider]?.[providerStatus] ?? providerStatus;

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

export const dynamic = "force-dynamic";
