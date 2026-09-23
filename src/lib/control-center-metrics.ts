import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function pushControlCenterMetrics() {
  const startedAt = Date.now();
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

  const errors = [
    tenantError,
    userError,
    subscriptionError,
    accommodationError,
    activeBookingError,
    clientError,
    paymentError,
    activeBookingsError,
    expenseError,
  ].filter(Boolean);

  if (errors.length) {
    logger.error("metrics.collection.database_failed", errors[0], {
      duration_ms: Date.now() - startedAt,
    });
    throw errors[0];
  }

  const mrr=(subscriptions??[]).reduce((s,r)=>s+(Number(r.monthly_price)||0),0);
  const revenusCollectes=(payments??[]).reduce((s,r)=>s+(Number(r.amount)||0),0);
  const impayesActifs=(activeBookings??[]).reduce((s,r)=>s+Math.max(0,(Number(r.total_amount)||0)-(Number(r.amount_paid)||0)),0);
  const depensesMois=(monthExpenses??[]).reduce((s,r)=>s+(Number(r.amount)||0),0);
  const payload={
    projet:"sejoura", nom:"Séjoura",
    statut_sante:(tenantCount??0)===0?"warning":"healthy",
    mrr, comptes_actifs:tenantCount??0,
    details:{
      clients:tenantCount??0, utilisateurs_actifs:activeUserCount??0,
      abonnements_actifs:subscriptions?.length??0, etablissements_actifs:accommodationCount??0,
      reservations_actives:activeBookingCount??0, voyageurs:clientCount??0,
      revenus_collectes:revenusCollectes, impayes_actifs:impayesActifs, depenses_mois:depensesMois
    },
    timestamp:new Date().toISOString()
  };

  const controlCenterUrl=process.env.CONTROL_CENTER_URL?.trim();
  const secret=process.env.METRICS_PUSH_SECRET?.trim();
  if (!controlCenterUrl || !secret) {
    const error = new Error("Control Center metrics configuration is missing");
    logger.error("metrics.collection.configuration_missing", error, {
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }

  const response=await fetch(`${controlCenterUrl.replace(/\/$/,"")}/api/metrics/push`,{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${secret}`},
    body:JSON.stringify(payload),cache:"no-store",signal:AbortSignal.timeout(10000)
  });
  const result=await response.json().catch(()=>({}));
  if (!response.ok) {
    const error = new Error(`Control Center rejected metrics: ${response.status}`);
    logger.error("metrics.collection.control_center_rejected", error, {
      duration_ms: Date.now() - startedAt,
      http_status: response.status,
    });
    throw error;
  }

  logger.info("metrics.collection.completed", {
    duration_ms: Date.now() - startedAt,
    http_status: response.status,
  });

  return { payload, result };
}
