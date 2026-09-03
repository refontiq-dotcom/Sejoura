import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdCampaignPrice, isValidAdDuration, isValidRedirectUrl, type AdAudience } from "@/lib/ads";

const ALLOWED_AUDIENCES: AdAudience[] = ["all", "tourists", "locals", "business"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const redirectUrl = typeof body.redirectUrl === "string" ? body.redirectUrl.trim() : "";
  const durationDays = typeof body.durationDays === "number" ? body.durationDays : Number(body.durationDays);
  const audience: AdAudience = ALLOWED_AUDIENCES.includes(body.audience) ? body.audience : "all";
  const cities = Array.isArray(body.cities)
    ? body.cities.filter((c: unknown) => typeof c === "string" && c.trim().length > 0).map((c: string) => c.trim())
    : [];
  const country = typeof body.country === "string" ? body.country.trim() : "";

  if (!title || title.length < 3) {
    return NextResponse.json({ error: "Le titre doit contenir au moins 3 caractères." }, { status: 400 });
  }
  if (!imageUrl) {
    return NextResponse.json({ error: "Veuillez importer une affiche." }, { status: 400 });
  }
  if (!redirectUrl || !isValidRedirectUrl(redirectUrl)) {
    return NextResponse.json({ error: "Le lien de redirection est invalide." }, { status: 400 });
  }
  if (!isValidAdDuration(durationDays)) {
    return NextResponse.json({ error: "Durée de diffusion invalide." }, { status: 400 });
  }

  const amount = getAdCampaignPrice(durationDays);

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

  const { data: ad, error } = await admin
    .from("advertisements")
    .insert({
      tenant_id: userData.tenant_id,
      created_by: userData.id,
      title,
      description: description || null,
      image_url: imageUrl,
      redirect_url: redirectUrl,
      targeting: { cities, audience, country: country || undefined },
      duration_days: durationDays,
      amount,
      status: "draft",
    })
    .select()
    .single();

  if (error || !ad) {
    return NextResponse.json(
      { error: error?.message || "Impossible d'enregistrer la publicité." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, advertisement: ad });
}
