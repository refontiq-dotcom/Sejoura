import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/ads/list
// Liste les publicités du tenant connecté (réservé à l'admin_residence).
//
// Passe par le service_role côté serveur (comme /api/ads/create) au lieu d'un
// select direct navigateur→PostgREST : plus robuste (pas d'échec lié au JWT
// expiré côté client ou au cache de schéma PostgREST) et message d'erreur réel.
// ──────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Vous devez être connecté." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from("users")
    .select("id, tenant_id, role")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (!userData?.tenant_id || userData.role !== "admin_residence") {
    return NextResponse.json(
      { error: "Accès réservé à l'administrateur de l'établissement." },
      { status: 403 }
    );
  }

  const { data: ads, error } = await admin
    .from("advertisements")
    .select("*")
    .eq("tenant_id", userData.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Impossible de charger les publicités." },
      { status: 500 }
    );
  }

  return NextResponse.json({ advertisements: ads ?? [] });
}
