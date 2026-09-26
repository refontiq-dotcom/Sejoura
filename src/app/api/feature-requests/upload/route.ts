import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { handleMediaUpload, mediaErrorJson } from "@/lib/media";

// POST /api/feature-requests/upload — capture d'écran de la boîte à idées.
// Pipeline média centralisé : validation du contenu réel + optimisation WebP
// (GIF animé conservé) + stockage R2 (repli Supabase). Réponse { url } inchangée.

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

    // Pipeline média centralisé (clé sûre uploads/{uuid}.{ext} côté serveur)
    const handled = await handleMediaUpload({ file, kind: "screenshot" });

    return NextResponse.json({ url: handled.stored.url });
  } catch (error) {
    return mediaErrorJson(error);
  }
}
