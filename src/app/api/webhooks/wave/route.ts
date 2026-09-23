import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWaveSignature } from "@/lib/wave";
import {
  escapeMarkdown,
  getTelegramAdminUrl,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";
import { formatFCFA, getPlanLabel } from "@/lib/utils";

function rpcErrorStatus(message: string) {
  if (
    message.includes("WAVE_EVENT_ID_REQUIRED") ||
    message.includes("WAVE_SUBSCRIPTION_REQUIRED") ||
    message.includes("WAVE_AMOUNT_INVALID") ||
    message.includes("WAVE_CURRENCY_INVALID") ||
    message.includes("WAVE_AMOUNT_MISMATCH")
  ) {
    return 400;
  }

  if (message.includes("WAVE_SUBSCRIPTION_NOT_FOUND")) {
    return 404;
  }

  return 500;
}

export async function POST(request: Request) {
  const signatureHeader = request.headers.get("Wave-Signature");
  const webhookSecret = process.env.WAVE_WEBHOOK_SECRET;

  if (!signatureHeader || !webhookSecret) {
    return NextResponse.json(
      { error: "Signature Wave manquante ou configuration Webhook absente." },
      { status: 400 }
    );
  }

  const payload = await request.text();

  if (!verifyWaveSignature(payload, signatureHeader, webhookSecret)) {
    return NextResponse.json(
      { error: "Signature Wave invalide." },
      { status: 400 }
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: "Payload JSON invalide." },
      { status: 400 }
    );
  }

  const eventRecord = event as {
    id?: unknown;
    type?: unknown;
    data?: {
      object?: {
        id?: unknown;
        client_reference?: unknown;
        amount?: unknown;
        amount_subtotal?: unknown;
        currency?: unknown;
      };
    };
  };

  const eventId = typeof eventRecord.id === "string" ? eventRecord.id.trim() : "";
  const eventType =
    typeof eventRecord.type === "string" ? eventRecord.type.trim() : "";

  if (!eventId || !eventType) {
    return NextResponse.json(
      { error: "Identifiant ou type d'événement manquant." },
      { status: 400 }
    );
  }

  const checkout = eventRecord.data?.object;
  const subscriptionId =
    typeof checkout?.client_reference === "string"
      ? checkout.client_reference.trim()
      : "";

  const rawAmount = checkout?.amount ?? checkout?.amount_subtotal;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string"
        ? Number(rawAmount)
        : NaN;

  const currency =
    typeof checkout?.currency === "string"
      ? checkout.currency.toUpperCase()
      : "";

  const checkoutId =
    typeof checkout?.id === "string" ? checkout.id.trim() : "";

  if (eventType === "checkout.session.completed") {
    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Référence d'abonnement manquante." },
        { status: 400 }
      );
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Montant Wave invalide." },
        { status: 400 }
      );
    }

    if (currency !== "XOF") {
      return NextResponse.json(
        { error: "Devise Wave invalide." },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("process_wave_checkout_webhook", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_subscription_id: subscriptionId || null,
    p_checkout_id: checkoutId || null,
    p_amount: Number.isSafeInteger(amount) ? amount : null,
    p_currency: currency || null,
  });

  if (error) {
    console.error("wave webhook processing:", error);
    return NextResponse.json(
      { error: "Impossible de traiter l'événement Wave." },
      { status: rpcErrorStatus(error.message || "") }
    );
  }

  if (eventType !== "checkout.session.completed" || data?.ignored) {
    return NextResponse.json({ received: true });
  }

  if (data?.duplicate) {
    return NextResponse.json({ received: true });
  }

  if (isTelegramConfigured()) {
    try {
      const tenantId = typeof data?.tenant_id === "string" ? data.tenant_id : "";
      const subscriptionIdResult =
        typeof data?.subscription_id === "string" ? data.subscription_id : "";

      const { data: subscription } = await admin
        .from("subscriptions")
        .select("plan, tenant_id")
        .eq("id", subscriptionIdResult)
        .maybeSingle();

      const { data: tenant } = tenantId
        ? await admin
            .from("tenants")
            .select("company_name")
            .eq("id", tenantId)
            .maybeSingle()
        : { data: null };

      const plan = subscription?.plan;
      const adminUrl = getTelegramAdminUrl(
        "https://app.sejoura.com/admin?next=/admin/sejour"
      );
      const message = [
        "💵 *Paiement Wave reçu — Sejoura*",
        "",
        `🏢 *Résidence :* ${escapeMarkdown(
          tenant?.company_name || "Établissement inconnu"
        )}`,
        `📦 *Formule :* ${escapeMarkdown(
          plan ? getPlanLabel(plan) : "Abonnement"
        )}`,
        `💰 *Montant :* ${formatFCFA(amount)}`,
        "⏳ *Abonnement actif pour 30 jours*",
        "",
        `🔗 [Voir sur le Dashboard Admin](${adminUrl})`,
      ].join("\n");

      const sent = await sendTelegramMessage(message);
      if (!sent) console.error("Telegram wave payment alert failed");
    } catch (error) {
      console.error("wave webhook telegram:", error);
    }
  }

  return NextResponse.json({ received: true });
}
