import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TYPES = ["cleaning", "linen", "assistance"];

/**
 * POST /api/stay/request
 *
 * Route publique : crée une demande de service depuis l'espace client
 * (ménage, literie/linge, assistance). Valide le token et notifie le
 * personnel via la fonction RPC create_service_request.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token : "";
    const requestType = typeof body?.request_type === "string" ? body.request_type : "";
    const message =
      typeof body?.message === "string" ? body.message.slice(0, 500) : "";

    if (!token) {
      return NextResponse.json({ error: "Token requis." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(requestType)) {
      return NextResponse.json({ error: "Type de demande invalide." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_service_request", {
      p_token: token,
      p_request_type: requestType,
      p_message: message || null,
    });

    if (error) {
      console.error("Erreur create_service_request:", error);
      return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
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
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
