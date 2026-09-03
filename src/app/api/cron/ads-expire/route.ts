import { NextResponse } from "next/server";
import { expireAndUnpublishAdvertisements } from "@/lib/trouvetou/ads";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const result = await expireAndUnpublishAdvertisements();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[AdsCron] error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}

export const dynamic = "force-dynamic";
