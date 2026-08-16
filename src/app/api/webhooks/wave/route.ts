import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWaveSignature } from "@/lib/wave";

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
  const isValid = verifyWaveSignature(payload, signatureHeader, webhookSecret);
  if (!isValid) {
    return NextResponse.json({ error: "Signature Wave invalide." }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Payload JSON invalide." }, { status: 400 });
  }

  const eventId = event?.id;
  if (!eventId) {
    return NextResponse.json({ error: "Identifiant d'événement manquant." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existingEvent, error: existingEventError } = await admin
    .from("wave_webhook_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (existingEventError) {
    return NextResponse.json(
      { error: "Impossible de vérifier l'événement Wave." },
      { status: 500 }
    );
  }

  if (existingEvent) {
    return NextResponse.json({ received: true });
  }

  const { error: insertEventError } = await admin
    .from("wave_webhook_events")
    .insert({ id: eventId, event_type: event.type });

  if (insertEventError) {
    return NextResponse.json(
      { error: "Impossible de stocker l'événement Wave." },
      { status: 500 }
    );
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const checkout = event?.data?.object;
  const subscriptionId = checkout?.client_reference;

  if (!subscriptionId) {
    return NextResponse.json({ error: "Référence d'abonnement manquante." }, { status: 400 });
  }

  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("*")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subscriptionError || !subscription) {
    return NextResponse.json({ error: "Abonnement introuvable." }, { status: 400 });
  }

  const amount = Number.parseInt(checkout?.amount ?? checkout?.amount_subtotal ?? subscription.monthly_price?.toString() ?? "0", 10) || subscription.monthly_price;

  const { data: receiverUser, error: receiverError } = await admin
    .from("users")
    .select("id")
    .eq("tenant_id", subscription.tenant_id)
    .eq("role", "admin_residence")
    .limit(1)
    .maybeSingle();

  let receivedBy = receiverUser?.id;
  if (!receivedBy) {
    const { data: fallbackUser } = await admin
      .from("users")
      .select("id")
      .eq("tenant_id", subscription.tenant_id)
      .limit(1)
      .maybeSingle();
    receivedBy = fallbackUser?.id ?? null;
  }

  const now = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_start: now,
      current_period_end: periodEnd,
      is_soft_locked: false,
      last_payment_at: now,
      last_payment_amount: amount,
      payment_method: "wave",
    })
    .eq("id", subscriptionId);

  if (updateError) {
    return NextResponse.json(
      { error: "Impossible de mettre à jour l'abonnement." },
      { status: 500 }
    );
  }

  if (receivedBy) {
    const { error: paymentError } = await admin.from("payments").insert({
      tenant_id: subscription.tenant_id,
      booking_id: null,
      amount,
      payment_method: "mobile_money",
      mobile_money_operator: "wave",
      payment_date: now,
      reference: checkout?.id ?? eventId,
      received_by: receivedBy,
      operation_type: "subscription",
      notes: `Paiement d'abonnement Wave ${eventId}`,
    });

    if (paymentError) {
      return NextResponse.json(
        { error: "Impossible d'enregistrer le paiement." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
