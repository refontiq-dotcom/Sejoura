import { NextResponse } from "next/server";
import { getServerAdmin, getServerUser } from "@/lib/supabase/server-auth";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/trouvetou/upload-photo
// Upload d'une photo de chambre sur le bucket 'room-photos'.
// Vérifie la session utilisateur, la taille et le type MIME du fichier.
// Le fichier est stocké sous {tenantId}/room-types/{uuid}.{ext} pour éviter
// les collisions et faciliter un éventuel nettoyage. Retourne l'URL publique.
// ──────────────────────────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("photo") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Aucune photo fournie." }, { status: 400 });
    }

    const admin = getServerAdmin();

    // Vérification de la session utilisateur + récupération du tenant
    const user = await getServerUser(admin, req);
    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const tenantId = user.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "Compte utilisateur introuvable." }, { status: 404 });
    }

    // Validation taille + type MIME
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "La photo fait plus de 5 Mo. Réduisez-la 📸" },
        { status: 400 }
      );
    }
    const mime = file.type || "";
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { error: "Format d'image non supporté (JPEG, PNG, WebP, AVIF, GIF)." },
        { status: 400 }
      );
    }

    // Upload sur le bucket room-photos
    const extension = mime.split("/")[1] || "jpg";
    const safeExt = extension === "jpeg" ? "jpg" : extension;
    const filePath = `${tenantId}/room-types/${crypto.randomUUID()}.${safeExt}`;

    const { error: uploadError } = await admin.storage
      .from("room-photos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: mime,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = await admin.storage
      .from("room-photos")
      .getPublicUrl(filePath);

    if (!publicUrlData?.publicUrl) {
      return NextResponse.json({ error: "Impossible de récupérer l'URL de la photo." }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue lors de l'upload.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
