import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook générique pour la réception des paiements (Wave, Orange Money, etc.)
 * Ce fichier prépare le terrain pour intégrer directement les opérateurs.
 */
export async function POST(request: Request) {
  try {
    // 1. Extraction du payload (selon le provider)
    const body = await request.json();
    
    // Pour l'instant, on se base sur un format générique interne
    // En production, il faudra parser selon le format Wave ou Orange Money
    const { provider, transaction_id, provider_status, amount } = body;

    if (!provider || !transaction_id) {
      return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 2. Retrouver la transaction en attente correspondante
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

    // 3. Traitement selon le statut renvoyé par l'opérateur
    const isSuccessful = provider_status === "successful" || provider_status === "completed";
    const newStatus = isSuccessful ? "successful" : "failed";

    // 4. Mettre à jour la transaction
    await admin
      .from("online_payment_transactions")
      .update({
        status: newStatus,
        webhook_payload: body,
      })
      .eq("id", tx.id);

    // 5. Si le paiement est réussi, confirmer la réservation
    if (isSuccessful) {
      // Mettre à jour la réservation
      const { data: booking } = await admin
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", tx.booking_id)
        .eq("status", "pending_payment")
        .select("id, tenant_id")
        .single();

      // Enregistrer le paiement dans la table de comptabilité (payments)
      if (booking) {
        // Résoudre le système comme "received_by"
        // On récupère le super admin ou l'admin de la résidence
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
