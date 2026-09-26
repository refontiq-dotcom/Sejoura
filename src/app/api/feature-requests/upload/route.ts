import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { getMediaStorageDriver, joinMediaKey, uploadToR2Media } from "@/lib/storage/r2";

const BUCKET = "feature-screenshots";
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * POST /api/feature-requests/upload
 *
 * Upload d'une capture d'écran jointe à une suggestion de la boîte à idées.
 * Multipart form-data : champ `file`.
 */
export async function POST(req: Request) {
  try {
    // ── Auth : utilisateur connecté requis ────────────────────────────────────
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Format d'image non supporté. Utilisez PNG, JPEG, WebP ou GIF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Image trop volumineuse (8 Mo maximum)." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    const extension = file.name.split(".").pop() || "png";
    const filePath = joinMediaKey("uploads", `${crypto.randomUUID()}.${extension}`);

    let publicUrl: string;

    if (getMediaStorageDriver() === "r2") {
      // ── Pilote R2 : le bucket média doit exister côté Cloudflare (créé une fois)
      const r2Result = await uploadToR2Media({ key: filePath, file });
      if (!r2Result.ok) {
        return NextResponse.json({ error: r2Result.error }, { status: 500 });
      }
      publicUrl = r2Result.url;
    } else {
      // ── Pilote Supabase Storage (historique) : bucket créé à la volée (idempotent)
      try {
        await adminSupabase.storage.createBucket(BUCKET, { public: true });
      } catch {
        // Le bucket existe déjà : on continue
      }

      const { error: uploadError } = await adminSupabase.storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const { data: publicUrlData } = await adminSupabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      if (!publicUrlData?.publicUrl) {
        return NextResponse.json({ error: "Impossible de récupérer l'URL de l'image." }, { status: 500 });
      }
      publicUrl = publicUrlData.publicUrl;
    }

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue lors de l'upload.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
