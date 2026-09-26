import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { handleMediaUpload, mediaErrorJson } from "@/lib/media";

// POST /api/ads/upload — affiche d'annonce (advertisements.image_url).
// Pipeline média centralisé : validation du contenu réel + optimisation WebP +
// stockage R2 (repli Supabase). Réponse { url } inchangée.

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Aucune affiche fournie." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from("users")
      .select("id, tenant_id, role")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (!userData || userData.role !== "admin_residence" || !userData.tenant_id) {
      return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    }

    // Pipeline média centralisé (tenant issu de la DB, jamais du client)
    const handled = await handleMediaUpload({ file, kind: "ad", tenantId: userData.tenant_id });

    return NextResponse.json({ url: handled.stored.url });
  } catch (error) {
    return mediaErrorJson(error);
  }
}
