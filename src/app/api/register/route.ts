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
      fullName,
      residenceName,
      residenceType,
      residenceLocation,
      country = "Côte d'Ivoire",
      phone = "",
    } = body;

    const email = session.user.email?.trim();
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
      .select("id, tenant_id")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (existingUser?.tenant_id) {
      const { data: existingAccommodation, error: accommodationLookupError } = await admin
        .from("accommodations")
        .select("id")
        .eq("tenant_id", existingUser.tenant_id)
        .limit(1)
        .maybeSingle();

      if (accommodationLookupError) {
        return NextResponse.json({ error: "Impossible de vérifier votre établissement existant." }, { status: 500 });
      }
      if (existingAccommodation) {
        return NextResponse.json({ success: true, tenantId: existingUser.tenant_id, accommodationId: existingAccommodation.id });
      }

      // Réparation idempotente d'un onboarding interrompu : le profil et le
      // tenant existent, seule la résidence manque.
      const { data: accommodation, error: accommodationError } = await admin
        .from("accommodations")
        .insert({
          tenant_id: existingUser.tenant_id,
          name: residenceName,
          description: residenceType,
          address: residenceLocation,
          city: residenceLocation,
          country: countryName,
          currency: countryConfig?.currency ?? "XOF",
          currency_symbol: countryConfig?.currencySymbol ?? "FCFA",
          phone_code: countryConfig?.phoneCode ?? "+225",
          language: countryConfig?.defaultLang ?? "fr",
          contact_phone: phone,
          total_rooms: 0,
          is_active: true,
        })
        .select("id")
        .single();

      if (accommodationError || !accommodation) {
        return NextResponse.json({ error: "Impossible de finaliser la création de l'établissement." }, { status: 500 });
      }
      return NextResponse.json({ success: true, tenantId: existingUser.tenant_id, accommodationId: accommodation.id, recovered: true });
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
    const { data: accommodationData, error: accError } = await admin.from("accommodations").insert({
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
    }).select("id").single();

    if (accError || !accommodationData) {
      await admin.from("tenants").delete().eq("id", tenantData.id);
      return NextResponse.json(
        { error: "Erreur lors de la création de l'établissement. Veuillez réessayer." },
        { status: 500 }
      );
    }

    // 4. Créer ou réparer le profil applicatif à partir de l'identité auth.uid().
    // Aucun identifiant fourni par le navigateur n'est utilisé pour cette liaison.
    const profilePayload = {
      tenant_id: tenantData.id,
      auth_user_id: session.user.id,
      role: "admin_residence" as const,
      full_name: fullName,
      phone,
      email,
      is_active: true,
      activated_at: now,
    };
    const { error: userError } = existingUser
      ? await admin.from("users").update(profilePayload).eq("id", existingUser.id)
      : await admin.from("users").insert(profilePayload);

    if (userError) {
      await admin.from("tenants").delete().eq("id", tenantData.id);
      return NextResponse.json(
        { error: "Erreur lors de la création du profil utilisateur. Veuillez réessayer." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, tenantId: tenantData.id, accommodationId: accommodationData.id });
  } catch {
    return NextResponse.json(
      { error: "Une erreur interne est survenue. Veuillez réessayer plus tard." },
      { status: 500 }
    );
  }
}
