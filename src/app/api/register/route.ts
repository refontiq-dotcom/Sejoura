import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
      phone = "",
      plan = "free",
    } = body;

    if (!email || !fullName || !residenceName || !residenceLocation) {
      return NextResponse.json(
        { error: "Tous les champs requis doivent être renseignés." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

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
        country: "Côte d'Ivoire",
      })
      .select()
      .single();

    if (tenantError || !tenantData) {
      return NextResponse.json(
        { error: "Erreur lors de la création de l'espace. Veuillez réessayer." },
        { status: 500 }
      );
    }

    // 2. Create Subscription
    const isFree = plan === "free";
    const subscriptionPlan = isFree ? "standard" : plan;
    const { error: subError } = await admin.from("subscriptions").insert({
      tenant_id: tenantData.id,
      plan: subscriptionPlan,
      status: isFree ? "active" : "trial",
      trial_ends_at: isFree
        ? new Date(Date.now() + 99 * 365 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      monthly_price: isFree ? 0 : 15000,
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
      country: "Côte d'Ivoire",
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
      activated_at: new Date().toISOString(),
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
