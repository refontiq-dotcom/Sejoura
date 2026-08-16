import { NextRequest, NextResponse } from "next/server";
import { syncListingsToTrouvetou } from "@/lib/trouvetou/sync";

/**
 * SÉJOURA — Déclenchement manuel / cron de la synchronisation Trouvetou.
 *
 *   POST /api/trouvetou/sync
 *   x-sync-secret: <TROUVETOU_SYNC_SECRET>
 *
 * Appelable par un cron (Vercel Cron, GitHub Actions, ...) ou par un admin.
 * La variable d'environnement TROUVETOU_SYNC_SECRET doit être configurée.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.TROUVETOU_SYNC_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "TROUVETOU_SYNC_SECRET non configurée." },
      { status: 503 }
    );
  }

  const provided = req.headers.get("x-sync-secret");
  if (provided !== secret) {
    return NextResponse.json(
      { ok: false, error: "Non autorisé. En-tête x-sync-secret invalide." },
      { status: 401 }
    );
  }

  const result = await syncListingsToTrouvetou();

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 502 }
    );
  }

  return NextResponse.json(result);
}

/**
 * Déclenchement via Vercel Cron (requêtes GET uniquement).
 * Le cron envoie l'en-tête `Authorization: Bearer <CRON_SECRET>`.
 * Sans secret valide, renvoie l'état de configuration (comportement d'origine).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.TROUVETOU_SYNC_SECRET;

  const configured = Boolean(
    process.env.TROUVETOU_SYNC_URL &&
      process.env.TROUVETOU_API_KEY &&
      process.env.TROUVETOU_SYNC_SECRET
  );

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? null;
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: true, configured });
  }

  const result = await syncListingsToTrouvetou();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
