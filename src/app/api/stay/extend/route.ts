import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/stay/extend
 *
 * Route publique : crée une demande de prolongation de séjour depuis l'espace
 * client. Valide le token, la date demandée et notifie le personnel via la
 * fonction RPC request_stay_extension.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token : "";
    const requestedDate =
      typeof body?.requested_check_out_date === "string" ? body.requested_check_out_date : "";
    const message =
      typeof body?.message === "string" ? body.message.slice(0, 500) : "";

    if (!token) {
      return NextResponse.json({ error: "Token requis." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return NextResponse.json({ error: "Date de départ invalide." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("request_stay_extension", {
      p_token: token,
      p_new_check_out_date: requestedDate,
      p_message: message || null,
    });

    if (error) {
      console.error("Erreur request_stay_extension:", error);
      return NextResponse.json({ error: "Erreur serveur 🖥️." }, { status: 500 });
    }

    if (!data?.ok) {
      return NextResponse.json(
        { error: data?.error || "Demande refusée." },
        { status: 403 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erreur serveur 🖥️." }, { status: 500 });
  }
}
