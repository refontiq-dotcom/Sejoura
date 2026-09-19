import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_HEALTH = new Set(["healthy", "warning", "critical", "unknown"]);

function isAuthorized(req: Request): boolean {
  const expected = process.env.METRICS_PUSH_SECRET?.trim();
  if (!expected) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    const [{ count: tenantCount, error: tenantError }, { count: activeUserCount, error: userError }, { data: subscriptions, error: subscriptionError }] =
      await Promise.all([
        admin.from("tenants").select("id", { count: "exact", head: true }).eq("is_suspended", false),
        admin.from("users").select("id", { count: "exact", head: true }).eq("is_active", true).neq("role", "client"),
        admin.from("subscriptions").select("monthly_price, subscription_status").eq("subscription_status", "active"),
      ]);

    if (tenantError) throw tenantError;
    if (userError) throw userError;
    if (subscriptionError) throw subscriptionError;

    const mrr = (subscriptions ?? []).reduce(
      (sum, row) => sum + (Number(row.monthly_price) || 0),
      0
    );

    const health = tenantCount === 0 ? "warning" : "healthy";
    const payload = {
      projet: "sejoura",
      nom: "Séjoura",
      statut_sante: ALLOWED_HEALTH.has(health) ? health : "unknown",
      mrr,
      comptes_actifs: activeUserCount ?? 0,
      timestamp: new Date().toISOString(),
    };

    const controlCenterUrl = process.env.CONTROL_CENTER_URL?.trim();
    const secret = process.env.METRICS_PUSH_SECRET?.trim();
    if (!controlCenterUrl || !secret) {
      return NextResponse.json(
        { error: "Control Center metrics configuration is missing" },
        { status: 503 }
      );
    }

    const response = await fetch(
      `${controlCenterUrl.replace(/\/$/, "")}/api/metrics/push`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: "Control Center rejected metrics", details: result },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, metrics: payload, controlCenter: result });
  } catch (error) {
    console.error("sejoura metrics push:", error);
    return NextResponse.json({ error: "Metrics collection failed" }, { status: 500 });
  }
}
