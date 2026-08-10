import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/employee-verify?phone=0701234567
 *
 * Vérifie si un numéro de téléphone est enregistré par un employeur.
 * Retourne le profil partiel (sans données sensibles) et le flag first_login.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");

    if (!phone) {
      return NextResponse.json({ error: "Numéro de téléphone requis." }, { status: 400 });
    }

    const digitsOnly = phone.replace(/[^0-9]/g, "");
    if (digitsOnly.length < 8) {
      return NextResponse.json({ error: "Numéro invalide." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer tous les utilisateurs actifs (employés) — filtrage côté app pour flexibilité
    const { data: allUsers, error } = await admin
      .from("users")
      .select("id, tenant_id, full_name, phone, role, is_active, first_login, pin_code")
      .neq("role", "super_admin");

    if (error || !allUsers) {
      return NextResponse.json({ error: "Erreur de base de données." }, { status: 500 });
    }

    // Recherche flexible par correspondance de chiffres (supporte +225, 225, 07...)
    const matchedUser = allUsers.find((u) => {
      if (!u.phone) return false;
      const uDigits = u.phone.replace(/[^0-9]/g, "");
      return uDigits.endsWith(digitsOnly) || digitsOnly.endsWith(uDigits);
    });

    if (!matchedUser) {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    // Vérification que l'employé est toujours actif (révocation en temps réel)
    if (matchedUser.is_active === false) {
      return NextResponse.json({
        found: false,
        error: "Votre accès a été révoqué par l'employeur.",
      }, { status: 200 });
    }

    // Récupérer le tenant de l'utilisateur pour récupérer sa couleur primaire et le nom d'entreprise
    let primaryColor = "#2563eb";
    let companyName: string | null = null;
    if (matchedUser.tenant_id) {
      const { data: tenant } = await admin
        .from("tenants")
        .select("primary_color, company_name")
        .eq("id", matchedUser.tenant_id)
        .single();
      if (tenant?.primary_color) primaryColor = tenant.primary_color;
      if (tenant?.company_name) companyName = tenant.company_name;
    }

    return NextResponse.json({
      found: true,
      userId: matchedUser.id,
      fullName: matchedUser.full_name,
      role: matchedUser.role,
      firstLogin: matchedUser.first_login ?? true,
      hasPinCode: matchedUser.pin_code !== null,
      primaryColor,
      companyName,
    });
  } catch (err) {
    console.error("Erreur API employee-verify:", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
