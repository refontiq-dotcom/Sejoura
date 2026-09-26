import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { handleMediaUpload, mediaErrorJson } from "@/lib/media";

export async function POST(req: Request) {
  try {
    // ── Auth : vérifier la session + rôle admin + appartenance au tenant ─────
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("logo") as File | null;
    const tenantId = formData.get("tenantId");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier de logo fourni." }, { status: 400 });
    }

    if (!tenantId || typeof tenantId !== "string") {
      return NextResponse.json({ error: "Identifiant de l'entreprise manquant." }, { status: 400 });
    }

    // Vérifier que l'appelant est admin_residence du tenant
    const adminSupabase = createAdminClient();
    const { data: userData } = await adminSupabase
      .from("users")
      .select("id, tenant_id, role")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (!userData || userData.role !== "admin_residence" || userData.tenant_id !== tenantId) {
      return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    }

    // ── Pipeline média : validation contenu réel + optimisation + stockage ───
    // (taille max, formats, dimensions, compression et clé sûre centralisés ;
    //  le tenant vient de la vérification ci-dessus, jamais du client)
    const handled = await handleMediaUpload({ file, kind: "logo", tenantId });

    const { error: updateError } = await adminSupabase
      .from("tenants")
      .update({ logo_url: handled.stored.url })
      .eq("id", tenantId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ logoUrl: handled.stored.url });
  } catch (error) {
    return mediaErrorJson(error);
  }
}
