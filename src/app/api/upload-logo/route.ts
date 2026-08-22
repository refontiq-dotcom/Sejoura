import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 Mo

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

    // ── Validation du fichier ────────────────────────────────────────────────
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Format non supporté. Utilisez PNG, JPEG, WebP ou SVG." },
        { status: 400 }
      );
    }
    if (file.size > MAX_LOGO_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (2 Mo maximum)." },
        { status: 400 }
      );
    }

    const safeExtensions: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    };
    const extension = safeExtensions[file.type] || "png";
    const filePath = `${tenantId}/logo.${extension}`;

    const { error: uploadError } = await adminSupabase.storage
      .from("logos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = await adminSupabase.storage
      .from("logos")
      .getPublicUrl(filePath);

    if (!publicUrlData?.publicUrl) {
      return NextResponse.json({ error: "Impossible de récupérer l'URL du logo." }, { status: 500 });
    }

    const { error: updateError } = await adminSupabase
      .from("tenants")
      .update({ logo_url: publicUrlData.publicUrl })
      .eq("id", tenantId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ logoUrl: publicUrlData.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue lors de l'upload du logo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
