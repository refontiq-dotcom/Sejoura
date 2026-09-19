import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SHARED_SECRET = process.env.METRICS_PUSH_SECRET?.trim();

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (!SHARED_SECRET || auth !== `Bearer ${SHARED_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const action = body?.action === "validate" || body?.action === "reject" ? body.action : null;

    if (!requestId || !action) {
      return NextResponse.json({ error: "requestId et action requis" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: requestRow, error: requestError } = await admin
      .from("subscription_payment_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!requestRow) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    if (requestRow.status !== "pending") {
      return NextResponse.json(
        { error: "Demande déjà traitée", status: requestRow.status },
        { status: 409 }
      );
    }

    if (action === "reject") {
      const { data, error } = await admin
        .from("subscription_payment_requests")
        .update({
          status: "rejected",
          validated_at: new Date().toISOString(),
          notes: requestRow.notes
            ? `${requestRow.notes} — Rejeté par Refontiq Control Center`
            : "Rejeté par Refontiq Control Center",
        })
        .eq("id", requestId)
        .eq("status", "pending")
        .select()
        .single();

      if (error) throw error;

      await admin.from("notifications").insert({
        tenant_id: requestRow.tenant_id,
        user_id: null,
        title: "Paiement rejeté",
        message: "Votre paiement d'abonnement n'a pas été validé par Refontiq Control Center. Vous pouvez soumettre une nouvelle demande.",
        type: "error",
        link: "/dashboard/subscription",
      });

      return NextResponse.json({ success: true, action, data });
    }

    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("id")
      .eq("tenant_id", requestRow.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription?.id) {
      return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });
    }

    const { error: updateSubscriptionError } = await admin
      .from("subscriptions")
      .update({
        subscription_status: "active",
        subscription_end_date: endDate,
        status: "active",
        is_soft_locked: false,
        current_period_start: new Date().toISOString(),
        current_period_end: endDate,
        plan: requestRow.plan,
        monthly_price: requestRow.amount,
        payment_method: "wave",
        last_payment_at: new Date().toISOString(),
        last_payment_amount: requestRow.amount,
      })
      .eq("id", subscription.id);

    if (updateSubscriptionError) throw updateSubscriptionError;

    await admin
      .from("users")
      .update({ is_active: true })
      .eq("tenant_id", requestRow.tenant_id);

    const { data, error } = await admin
      .from("subscription_payment_requests")
      .update({
        status: "validated",
        validated_at: new Date().toISOString(),
        notes: requestRow.notes
          ? `${requestRow.notes} — Validé par Refontiq Control Center`
          : "Validé par Refontiq Control Center",
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select()
      .single();

    if (error) throw error;

    await admin.from("notifications").insert({
      tenant_id: requestRow.tenant_id,
      user_id: null,
      title: "Abonnement activé",
      message: "Votre paiement a été validé par Refontiq Control Center. Votre abonnement est maintenant actif.",
      type: "success",
      link: "/dashboard/subscription",
    });

    return NextResponse.json({ success: true, action, data });
  } catch (error) {
    console.error("[sejoura billing callback]", error);
    return NextResponse.json({ error: "Décision de facturation impossible" }, { status: 500 });
  }
}
