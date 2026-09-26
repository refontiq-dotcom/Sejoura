import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import {
  extensionFromMime,
  getMediaStorageDriver,
  joinMediaKey,
  uploadToR2Media,
} from "@/lib/storage/r2";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

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

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "L'affiche fait plus de 5 Mo. Réduisez-la." }, { status: 400 });
    }
    const mime = file.type || "";
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { error: "Format d'image non supporté (JPEG, PNG, WebP, AVIF)." },
        { status: 400 }
      );
    }

    // Upload du média (pilote choisi via MEDIA_STORAGE_DRIVER)
    const filePath = joinMediaKey(
      userData.tenant_id,
      "ads",
      `${crypto.randomUUID()}.${extensionFromMime(mime, "jpg")}`
    );

    let publicUrl: string;

    if (getMediaStorageDriver() === "r2") {
      // ── Pilote R2 : upload direct sur le bucket média Cloudflare ──────────
      const r2Result = await uploadToR2Media({ key: filePath, file });
      if (!r2Result.ok) {
        return NextResponse.json({ error: r2Result.error }, { status: 500 });
      }
      publicUrl = r2Result.url;
    } else {
      // ── Pilote Supabase Storage (historique) ──────────────────────────────
      const { error: uploadError } = await admin.storage.from("room-photos").upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: mime,
      });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const { data: publicUrlData } = admin.storage.from("room-photos").getPublicUrl(filePath);
      if (!publicUrlData?.publicUrl) {
        return NextResponse.json({ error: "Impossible de récupérer l'URL de l'affiche." }, { status: 500 });
      }
      publicUrl = publicUrlData.publicUrl;
    }

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue lors de l'upload.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
