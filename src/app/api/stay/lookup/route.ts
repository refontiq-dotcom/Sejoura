import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/stay/lookup?token=...
 *
 * Route publique : valide un token d'accès client et retourne l'état + les
 * données du séjour (via la fonction RPC SECURITY DEFINER get_client_stay).
 * Ne retourne aucune donnée sensible et refuse tout accès hors formule
 * Entreprise.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || "";

    if (!token) {
      return NextResponse.json({ error: "Token requis." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_client_stay", {
      p_token: token,
    });

    if (error) {
      console.error("Erreur get_client_stay:", error);
      return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
