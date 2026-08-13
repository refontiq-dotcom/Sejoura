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

    // Profil applicatif existant (créé par le trigger handle_new_user à
    // l'inscription, ou par une étape 2 déjà partielle).
    const { data: existingUser } = await admin
      .from("users")
      .select("id, tenant_id")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    // Espace déjà en cours de création : profil rattaché à un tenant, OU tenant
    // orphelin laissé par une tentative interrompue (rollback inabouti). On
    // reprend l'existant pour être strictement idempotent et ne jamais violer
    // la contrainte UNIQUE sur tenants.contact_email.
    let tenantId = existingUser?.tenant_id ?? null;
    if (!tenantId) {
      const { data: orphanTenant } = await admin
        .from("tenants")
        .select("id")
        .eq("contact_email", email)
        .maybeSingle();
      if (orphanTenant) tenantId = orphanTenant.id;
    }

    const accommodationPayload = {
      tenant_id: tenantId,
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
    };

    const profilePayload = {
      tenant_id: tenantId,
      auth_user_id: session.user.id,
      role: "admin_residence" as const,
      full_name: fullName,
      phone,
      email,
      is_active: true,
      activated_at: new Date().toISOString(),
    };

    // ── Reprise idempotente : l'espace (tenant) existe déjà ──
    if (tenantId) {
      const { data: existingAccommodation, error: accommodationLookupError } = await admin
        .from("accommodations")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle();

      if (accommodationLookupError) {
        console.error("register: accommodation lookup failed", accommodationLookupError);
        return NextResponse.json({ error: "Impossible de vérifier votre établissement existant." }, { status: 500 });
      }

      let accommodationId = existingAccommodation?.id ?? null;
      if (!accommodationId) {
        const { data: accommodation, error: accommodationError } = await admin
          .from("accommodations")
          .insert(accommodationPayload)
          .select("id")
          .single();
        if (accommodationError || !accommodation) {
          console.error("register: create accommodation failed", accommodationError);
          return NextResponse.json({ error: "Impossible de finaliser la création de l'établissement." }, { status: 500 });
        }
        accommodationId = accommodation.id;
      }

      // Abonnement manquant (tentative interrompue avant sa création) : le créer.
      const { data: existingSub } = await admin
        .from("subscriptions")
        .select("id")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!existingSub) {
        const plan = normalizePlan(body.plan || "free");
        const trialEnd = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { error: subError } = await admin.from("subscriptions").insert({
          tenant_id: tenantId,
          plan,
          status: "trial",
          trial_ends_at: trialEnd,
          current_period_start: new Date().toISOString(),
          current_period_end: trialEnd,
          monthly_price: getPlanPrice(plan),
          is_soft_locked: false,
        });
        if (subError) {
          console.error("register: recover subscription failed", subError);
          return NextResponse.json(
            { error: "Erreur lors de la configuration de l'abonnement. Veuillez réessayer." },
            { status: 500 }
          );
        }
      }

      // Rattacher / réparer le profil applicatif au tenant récupéré.
      const { error: userError } = existingUser
        ? await admin.from("users").update(profilePayload).eq("id", existingUser.id)
        : await admin.from("users").insert(profilePayload);
      if (userError) {
        console.error("register: upsert user profile failed", userError);
        return NextResponse.json(
          { error: "Erreur lors de la création du profil utilisateur. Veuillez réessayer." },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, tenantId, accommodationId });
    }

    // ── Création complète d'un espace neuf ──
    // 1. Tenant
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
      console.error("register: create tenant failed", tenantError);
      return NextResponse.json(
        { error: "Erreur lors de la création de l'espace. Veuillez réessayer." },
        { status: 500 }
      );
    }

    // 2. Abonnement (essai gratuit de 30 jours)
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
      console.error("register: create subscription failed", subError);
      // Nettoyage best-effort : si la suppression échoue, le tenant orphelin
      // sera réadopté par la reprise idempotente au prochain essai.
      await admin.from("tenants").delete().eq("id", tenantData.id);
      return NextResponse.json(
        { error: "Erreur lors de la configuration de l'abonnement. Veuillez réessayer." },
        { status: 500 }
      );
    }

    // 3. Établissement (première résidence)
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
      console.error("register: create accommodation failed", accError);
      await admin.from("tenants").delete().eq("id", tenantData.id);
      return NextResponse.json(
        { error: "Erreur lors de la création de l'établissement. Veuillez réessayer." },
        { status: 500 }
      );
    }

    // 4. Profil applicatif
    const { error: userError } = existingUser
      ? await admin.from("users").update(profilePayload).eq("id", existingUser.id)
      : await admin.from("users").insert({ ...profilePayload, tenant_id: tenantData.id });

    if (userError) {
      console.error("register: upsert user profile failed", userError);
      await admin.from("tenants").delete().eq("id", tenantData.id);
      return NextResponse.json(
        { error: "Erreur lors de la création du profil utilisateur. Veuillez réessayer." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, tenantId: tenantData.id, accommodationId: accommodationData.id });
  } catch (error) {
    console.error("register: unexpected error", error);
    return NextResponse.json(
      { error: "Une erreur interne est survenue. Veuillez réessayer plus tard." },
      { status: 500 }
    );
  }
}
