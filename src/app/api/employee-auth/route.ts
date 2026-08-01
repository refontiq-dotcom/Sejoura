import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, authUserId, email } = body;

    if (!phone || !authUserId) {
      return NextResponse.json(
        { error: "Numéro de téléphone et identifiant requis." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Nettoyage des chiffres du téléphone pour comparaison robuste
    const digitsOnly = phone.replace(/[^0-9]/g, "");

    // Recherche de l'employé dans la table users
    const { data: allUsers, error: searchErr } = await admin
      .from("users")
      .select("*");

    if (searchErr || !allUsers) {
      return NextResponse.json(
        { error: "Impossible d'accéder aux données employés." },
        { status: 500 }
      );
    }

    // Trouver par téléphone (chiffres équivalents ou sous-chaine) ou par email
    const matchedUser = allUsers.find((u) => {
      if (u.phone) {
        const uDigits = u.phone.replace(/[^0-9]/g, "");
        if (uDigits && (uDigits.endsWith(digitsOnly) || digitsOnly.endsWith(uDigits))) {
          return true;
        }
      }
      if (email && u.email && u.email.toLowerCase() === email.toLowerCase()) {
        return true;
      }
      return false;
    });

    if (!matchedUser) {
      return NextResponse.json(
        { error: "Aucun employé correspondant n'a été trouvé." },
        { status: 404 }
      );
    }

    // Mise à jour sécurisée via la clé service_role (Admin Client)
    const updateData: Record<string, unknown> = {
      auth_user_id: authUserId,
      is_active: true,
      activated_at: matchedUser.activated_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (email && (!matchedUser.email || matchedUser.email.includes("@employe.sejoura.com"))) {
      updateData.email = email;
    }

    const { data: updatedUser, error: updateErr } = await admin
      .from("users")
      .update(updateData)
      .eq("id", matchedUser.id)
      .select()
      .single();

    if (updateErr || !updatedUser) {
      return NextResponse.json(
        { error: "Erreur lors de l'activation du profil employé." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("Erreur API employee-auth:", err);
    return NextResponse.json(
      { error: "Une erreur serveur est survenue." },
      { status: 500 }
    );
  }
}
