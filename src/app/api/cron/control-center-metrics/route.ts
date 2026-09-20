import { NextResponse } from "next/server";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null;
  const metricsSecret = process.env.METRICS_PUSH_SECRET?.trim();

  if (!baseUrl || !metricsSecret) {
    return NextResponse.json({ error: "Metrics cron configuration is missing" }, { status: 503 });
  }

  const response = await fetch(`${baseUrl}/api/metrics/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${metricsSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({}));
  return NextResponse.json({ ok: response.ok, result }, { status: response.ok ? 200 : 502 });
}
