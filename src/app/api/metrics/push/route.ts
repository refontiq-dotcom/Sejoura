import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_HEALTH = new Set(["healthy", "warning", "critical", "unknown"]);

function isAuthorized(req: Request): boolean {
  const expected = process.env.METRICS_PUSH_SECRET?.trim();
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();

    const [
      { count: tenantCount, error: tenantError },
      { count: activeUserCount, error: userError },
      { data: subscriptions, error: subscriptionError },
      { count: accommodationCount, error: accommodationError },
      { count: activeBookingCount, error: activeBookingError },
      { count: clientCount, error: clientError },
      { data: payments, error: paymentError },
      { data: activeBookings, error: activeBookingsError },
      { data: monthExpenses, error: expenseError },
    ] = await Promise.all([
      admin.from("tenants").select("id", { count: "exact", head: true }).eq("is_suspended", false),
      admin.from("users").select("id", { count: "exact", head: true }).eq("is_active", true).neq("role", "client"),
      admin.from("subscriptions").select("monthly_price, subscription_status").eq("subscription_status", "active"),
      admin.from("accommodations").select("id", { count: "exact", head: true }).eq("is_active", true),
      admin.from("bookings").select("id", { count: "exact", head: true }).in("status", ["confirmed", "checked_in"]),
      admin.from("clients").select("id", { count: "exact", head: true }),
      admin.from("payments").select("amount"),
      admin.from("bookings").select("total_amount, amount_paid").in("status", ["confirmed", "checked_in"]),
      admin.from("expenses").select("amount").gte("expense_date", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),
    ]);

    for (const error of [tenantError, userError, subscriptionError, accommodationError, activeBookingError, clientError, paymentError, activeBookingsError, expenseError]) {
      if (error) throw error;
    }

    const mrr = (subscriptions ?? []).reduce((sum, row) => sum + (Number(row.monthly_price) || 0), 0);
    const revenusCollectes = (payments ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const impayesActifs = (activeBookings ?? []).reduce(
      (sum, row) => sum + Math.max(0, (Number(row.total_amount) || 0) - (Number(row.amount_paid) || 0)),
      0,
    );
    const depensesMois = (monthExpenses ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

    const health = (tenantCount ?? 0) === 0 ? "warning" : "healthy";
    const payload = {
      projet: "sejoura",
      nom: "Séjoura",
      statut_sante: ALLOWED_HEALTH.has(health) ? health : "unknown",
      mrr,
      comptes_actifs: tenantCount ?? 0,
      details: {
        clients: tenantCount ?? 0,
        utilisateurs_actifs: activeUserCount ?? 0,
        abonnements_actifs: subscriptions?.length ?? 0,
        etablissements_actifs: accommodationCount ?? 0,
        reservations_actives: activeBookingCount ?? 0,
        voyageurs: clientCount ?? 0,
        revenus_collectes: revenusCollectes,
        impayes_actifs: impayesActifs,
        depenses_mois: depensesMois,
      },
      timestamp: new Date().toISOString(),
    };

    const controlCenterUrl = process.env.CONTROL_CENTER_URL?.trim();
    const secret = process.env.METRICS_PUSH_SECRET?.trim();
    if (!controlCenterUrl || !secret) {
      return NextResponse.json({ error: "Control Center metrics configuration is missing" }, { status: 503 });
    }

    const response = await fetch(
      `${controlCenterUrl.replace(/\/$/, "")}/api/metrics/push`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: "Control Center rejected metrics", details: result }, { status: 502 });
    }

    return NextResponse.json({ ok: true, metrics: payload, controlCenter: result });
  } catch (error) {
    console.error("sejoura metrics push:", error);
    return NextResponse.json({ error: "Metrics collection failed" }, { status: 500 });
  }
}
