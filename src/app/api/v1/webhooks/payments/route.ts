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
    } else {
      const webhookSecret = process.env.WEBHOOK_SECRET?.trim();
      const providedSecret = request.headers.get("x-webhook-secret");
      if (!webhookSecret || providedSecret !== webhookSecret) {
        return NextResponse.json({ error: "Webhook non autorisé" }, { status: 401 });
      }
    }

    // 2. Parser le payload
    const body = JSON.parse(rawBody);
    const { transaction_id, provider_status } = body;

    if (!transaction_id || typeof transaction_id !== "string") {
      return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
    }

    // ── Contrôles de cohérence AVANT toute lecture/mutation ────────────────
    // Fournisseur : whitelist stricte — un fournisseur inconnu ne peut ni
    // interroger ni muter une transaction (le lookup DB filtre déjà sur
    // `provider`, la whitelist évite tout contournement par valeur exotique).
    const KNOWN_PROVIDERS = ["wave", "orange_money", "mtn", "moov_africa", "pi_spi"];
    if (!KNOWN_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "Fournisseur non pris en charge" }, { status: 400 });
    }

    // Statut obligatoire : un payload sans statut ne doit JAMAIS faire
    // basculer une transaction (échec silencieux ou confirmation hasardeuse).
    if (typeof provider_status !== "string" || !provider_status.trim()) {
      return NextResponse.json({ error: "Statut de paiement manquant" }, { status: 400 });
    }

    // Devise : le modèle `online_payment_transactions` est mono-XOF (montants
    // FCFA entiers, aucune colonne devise ; le flux abonnement impose XOF via
    // RPC). Toute devise fournie DOIT être XOF.
    if (body.currency !== undefined && body.currency !== null) {
      const providedCurrency = String(body.currency).toUpperCase();
      if (providedCurrency !== "XOF") {
        return NextResponse.json({ error: "Devise non prise en charge" }, { status: 400 });
      }
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
      // Transaction déjà traitée (webhook répété) : aucun effet métier.
      return NextResponse.json({ success: true, message: "Déjà traité" }, { status: 200 });
    }

    // ── Montant : le webhook ne peut que CORROBORER le montant enregistré ──
    // Jamais le montant reçu n'est utilisé comme preuve à lui seul : s'il est
    // présent, il doit correspondre exactement à `tx.amount` (montant attendu
    // persisté côté serveur à l'initiation). Absent → le secret partagé fait
    // foi et la confirmation utilise `tx.amount` (jamais une valeur reçue).
    if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
      const rawWebhookAmount =
        typeof body.amount === "string" ? Number(body.amount) : body.amount;
      if (!Number.isSafeInteger(rawWebhookAmount) || rawWebhookAmount !== tx.amount) {
        console.warn("Webhook Payment: montant incoherent rejete");
        return NextResponse.json({ error: "Montant incoherent" }, { status: 400 });
      }
    }

    // ── 4. Interprétation du statut (formats documentés dans ce dépôt) ─────
    // Wave : "successful" / "completed" ; Orange Money : "SUCCESS" ;
    // MTN : "SUCCESSFUL" ; Moov : "SUCCESS" ; PI-SPI : "SUCCESS" / "FAILED".
    // Tout statut hors de ces jeux connus est REFUSÉ (400) : on ne devine
    // jamais qu'un paiement a réussi ou échoué sur une valeur inconnue.
    const normalizedStatus = provider_status.trim().toLowerCase();
    const SUCCESS_STATUSES = new Set(["successful", "completed", "success"]);
    const FAILURE_STATUSES = new Set(["failed", "failure", "expired", "cancelled", "canceled"]);
    const isSuccessful = SUCCESS_STATUSES.has(normalizedStatus);
    const isFailed = FAILURE_STATUSES.has(normalizedStatus);
    if (!isSuccessful && !isFailed) {
      return NextResponse.json({ error: "Statut de paiement non reconnu" }, { status: 400 });
    }
    const newStatus = isSuccessful ? "successful" : "failed";

    // ── 5. Transition atomique (idempotence) ───────────────────────────────
    // Seule UNE transaction encore "pending" peut passer à un état final :
    // un webhook répété (ou simultané) ne modifie plus rien et ne déclenche
    // aucun effet métier. Si aucune ligne n'a été mise à jour, on répond
    // « Déjà traité » sans rien exécuter.
    const { data: updatedRows, error: updateError } = await admin
      .from("online_payment_transactions")
      .update({
        status: newStatus,
        webhook_payload: body,
      })
      .eq("id", tx.id)
      .eq("status", "pending")
      .select("id");

    if (updateError) {
      console.error("Webhook Payment: echec de transition");
      return NextResponse.json({ error: "Erreur interne serveur" }, { status: 500 });
    }
    const isFirstConfirmation = Array.isArray(updatedRows) && updatedRows.length > 0;
    if (!isFirstConfirmation) {
      // Course gagnée par un webhook concurrent : ne rien confirmer deux fois.
      return NextResponse.json({ success: true, message: "Déjà traité" }, { status: 200 });
    }

    // 6. Si le paiement est réussi, confirmer la réservation (une seule fois).
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
