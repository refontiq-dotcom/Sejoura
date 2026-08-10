import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("logo") as File | null;
    const tenantId = formData.get("tenantId");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier de logo fourni." }, { status: 400 });
    }

    if (!tenantId || typeof tenantId !== "string") {
      return NextResponse.json({ error: "Identifiant de l'entreprise manquant." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const extension = file.name.split(".").pop() || "png";
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
