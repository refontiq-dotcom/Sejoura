import { NextResponse } from "next/server";
import { getServerAdmin, getServerUser } from "@/lib/supabase/server-auth";
import { handleMediaUpload, handlePanorama360Upload, mediaErrorJson } from "@/lib/media";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/trouvetou/upload-photo
// Upload d'une photo de chambre (photos de type, Trouvetou).
// Vérifie la session utilisateur, puis délègue au pipeline média centralisé :
// validation du contenu réel, optimisation (WebP responsive), stockage R2
// (ou Supabase en repli), clé sûre {tenantId}/room-types/{uuid}.webp.
// Retourne l'URL publique.
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("photo") as File | null;
    const requestedKind = formData.get("kind");
    const kind = requestedKind === "panorama_360" ? "panorama_360" : "photo";

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

    if (kind === "panorama_360") {
      const handled = await handlePanorama360Upload({ file, tenantId });
      return NextResponse.json({
        url: handled.hd.url,
        hdUrl: handled.hd.url,
        mobileUrl: handled.mobile.url,
        previewUrl: handled.preview.url,
      });
    }

    // Pipeline média centralisé pour les photos classiques.
    const handled = await handleMediaUpload({ file, kind, tenantId });
    return NextResponse.json({ url: handled.stored.url });
  } catch (error) {
    return mediaErrorJson(error);
  }
}
