import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizePlan, getPlanPrice } from "@/lib/subscription-plans";
import { getCountryByNameOrCode } from "@/lib/countries";

const TRIAL_DURATION_DAYS = 30;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Vous devez être connecté pour finaliser l'inscription." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      email,
      fullName,
      residenceName,
      residenceType,
      residenceLocation,
      country = "Côte d'Ivoire",
      phone = "",
    } = body;

    if (!email || !fullName?.trim() || !residenceName?.trim() || !residenceType?.trim() || !residenceLocation?.trim() || !country?.trim()) {
      return NextResponse.json(
        { error: "Tous les champs requis doivent être renseignés." },
        { status: 400 }
      );
    }

    const countryConfig = getCountryByNameOrCode(country);
    const countryName = countryConfig?.name ?? country;

    const admin = createAdminClient();

    // Idempotence : si le profil existe déjà, on renvoie l'espace existant
    // pour éviter les doublons (tenant, abonnement, établissement) en cas de
    // double soumission ou de re-soumission après un échec réseau.
    const { data: existingUser } = await admin
      .from("users")
      .select("tenant_id")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (existingUser?.tenant_id) {
      return NextResponse.json({ success: true, tenantId: existingUser.tenant_id });
    }

    // 1. Create Tenant (Enterprise)
    const { data: tenantData, error: tenantError } = await admin
      .from("tenants")
      .insert({
        company_name: residenceName,
        contact_name: fullName,
        contact_email: email,
        contact_phone: phone,
        city: residenceLocation,
        address: residenceLocation,
        country: countryName,
      })
      .select()
      .single();

    if (tenantError || !tenantData) {
      return NextResponse.json(
        { error: "Erreur lors de la création de l'espace. Veuillez réessayer." },
        { status: 500 }
      );
    }

    // 2. Create Subscription (plan Free : essai gratuit de 1 mois)
    const plan = normalizePlan(body.plan || "free");
    const trialEnd = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const { error: subError } = await admin.from("subscriptions").insert({
      tenant_id: tenantData.id,
      plan,
      status: "trial",
      trial_ends_at: trialEnd,
      current_period_start: now,
      current_period_end: trialEnd,
      monthly_price: getPlanPrice(plan),
      is_soft_locked: false,
    });

    if (subError) {
      await admin.from("tenants").delete().eq("id", tenantData.id);
      return NextResponse.json(
        { error: "Erreur lors de la configuration de l'abonnement. Veuillez réessayer." },
        { status: 500 }
      );
    }

    // 3. Create Accommodation (First Residence)
    const { error: accError } = await admin.from("accommodations").insert({
      tenant_id: tenantData.id,
      name: residenceName,
      description: residenceType,
      address: residenceLocation,
      city: residenceLocation,
      country: countryName,
      currency: countryConfig?.currency ?? "XOF",
      currency_symbol: countryConfig?.currencySymbol ?? "FCFA",
      phone_code: countryConfig?.phoneCode ?? "+225",
      language: countryConfig?.defaultLang ?? "fr",
      total_rooms: 0,
      is_active: true,
    });

    if (accError) {
      await admin.from("tenants").delete().eq("id", tenantData.id);
      return NextResponse.json(
        { error: "Erreur lors de la création de l'établissement. Veuillez réessayer." },
        { status: 500 }
      );
    }

    // 4. Create Profile User (Admin)
    const { error: userError } = await admin.from("users").insert({
      tenant_id: tenantData.id,
      auth_user_id: session.user.id,
      role: "admin_residence",
      full_name: fullName,
      phone: phone,
      email: email,
      is_active: true,
      activated_at: now,
    });

    if (userError) {
      await admin.from("tenants").delete().eq("id", tenantData.id);
      return NextResponse.json(
        { error: "Erreur lors de la création du profil utilisateur. Veuillez réessayer." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, tenantId: tenantData.id });
  } catch {
    return NextResponse.json(
      { error: "Une erreur interne est survenue. Veuillez réessayer plus tard." },
      { status: 500 }
    );
  }
}
