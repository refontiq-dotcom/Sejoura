import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/employee-biometric?userId=<uuid>
 *
 * Indique si l'employé dispose d'au moins une clé biométrique (passkey)
 * enregistrée. Utilisé par le composant de connexion pour déclencher
 * automatiquement la demande Face ID / Empreinte.
 *
 * ⚠️  NOTE SÉCURITÉ : cet endpoint est appelé avant l'authentification.
 * Il ne retourne qu'un booléen (registered), pas de données sensibles.
 * Le userId doit être obtenu via /api/employee-verify (qui vérifie le téléphone).
 * TODO: supprimer cet endpoint quand le frontend utilisera directement
 * la réponse de employee-verify (qui inclut déjà le statut biométrique).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId || !UUID_RE.test(userId)) {
      return NextResponse.json({ error: "userId requis (UUID valide)." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("user_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) {
      console.error("Erreur API employee-biometric (status):", error.message);
      return NextResponse.json({ error: "Erreur de base de données." }, { status: 500 });
    }

    return NextResponse.json({ registered: (data?.length ?? 0) > 0 });
  } catch (err) {
    console.error("Erreur API employee-biometric:", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
