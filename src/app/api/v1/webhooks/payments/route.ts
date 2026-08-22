import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWaveSignature } from "@/lib/wave";

/**
 * Webhook pour la réception des paiements (Wave, Orange Money, etc.)
 *
 * ⚠️  Sécurité : la signature du webhook est vérifiée pour Wave.
 * Les providers sans signature (Orange Money, MTN, etc.) retournent
 * un header x-payment-provider qui doit être présent.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // 1. Vérification de la signature Wave si applicable
    const provider = request.headers.get("x-payment-provider") ?? "unknown";
    const waveSignature = request.headers.get("wave-signature");

    if (provider === "wave") {
      const waveSecret = process.env.WAVE_WEBHOOK_SECRET;
      if (!waveSecret) {
        console.error("Webhook Payment: WAVE_WEBHOOK_SECRET non configuré");
        return NextResponse.json({ error: "Configuration manquante" }, { status: 500 });
      }

      if (!waveSignature) {
        console.error("Webhook Payment: Signature Wave manquante");
        return NextResponse.json({ error: "Signature manquante" }, { status: 401 });
      }

      const isValid = verifyWaveSignature(rawBody, waveSignature, waveSecret);
      if (!isValid) {
        console.error("Webhook Payment: Signature Wave invalide");
        return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
      }
    }

    // 2. Parser le payload
    const body = JSON.parse(rawBody);
    const { transaction_id, provider_status, amount } = body;

    if (!transaction_id) {
      return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 3. Retrouver la transaction en attente correspondante
    const { data: tx, error: txError } = await admin
      .from("online_payment_transactions")
      .select("id, booking_id, status, amount")
      .eq("provider_transaction_id", transaction_id)
      .eq("provider", provider)
      .maybeSingle();

    if (txError || !tx) {
      console.error(`Webhook Payment: Transaction introuvable (${provider} - ${transaction_id})`);
      return NextResponse.json({ error: "Transaction introuvable" }, { status: 404 });
    }

    if (tx.status !== "pending") {
      // Transaction déjà traitée
      return NextResponse.json({ success: true, message: "Déjà traité" }, { status: 200 });
    }

    // 4. Traitement selon le statut renvoyé par l'opérateur
    const isSuccessful = provider_status === "successful" || provider_status === "completed";
    const newStatus = isSuccessful ? "successful" : "failed";

    // 5. Mettre à jour la transaction
    await admin
      .from("online_payment_transactions")
      .update({
        status: newStatus,
        webhook_payload: body,
      })
      .eq("id", tx.id);

    // 6. Si le paiement est réussi, confirmer la réservation
    if (isSuccessful) {
      const { data: booking } = await admin
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", tx.booking_id)
        .eq("status", "pending_payment")
        .select("id, tenant_id")
        .single();

      if (booking) {
        const { data: ownerUser } = await admin
          .from("users")
          .select("id")
          .eq("tenant_id", booking.tenant_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (ownerUser) {
          await admin
            .from("payments")
            .insert({
              tenant_id: booking.tenant_id,
              booking_id: booking.id,
              amount: tx.amount,
              payment_method: provider === "wave" ? "wave" : "other",
              reference: transaction_id,
              received_by: ownerUser.id,
              notes: "Paiement en ligne automatisé",
            });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook Payment Error:", error);
    return NextResponse.json({ error: "Erreur interne serveur" }, { status: 500 });
  }
}
