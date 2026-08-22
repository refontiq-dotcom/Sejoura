import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin, verifyPin } from "@/lib/pin";
import { signInEmployeeServerSide } from "@/lib/employee-auth";

/**
 * POST /api/employee-pin
 *
 * Body JSON :
 *   { action: "set",    userId: string, pin: string }  — Définit le code PIN (première connexion)
 *   { action: "verify", userId: string, pin: string }  — Vérifie le code PIN (reconnexion)
 *
 * ⚠️  Ne retourne JAMAIS le internalPassword. L'authentification Supabase
 * est effectuée côté serveur et seuls les tokens de session sont renvoyés.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userId, pin } = body;

    // Validation des entrées
    if (!action || !userId || !pin) {
      return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
    }
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "Le code PIN doit comporter exactement 4 chiffres." }, { status: 400 });
    }
    if (action !== "set" && action !== "verify") {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer l'employé
    const { data: user, error: fetchError } = await admin
      .from("users")
      .select("id, full_name, phone, email, role, is_active, first_login, pin_code, auth_user_id, activated_at, tenant_id")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError || !user) {
      return NextResponse.json({ error: "Employé introuvable." }, { status: 404 });
    }

    // Vérification révocation en temps réel
    if (user.is_active === false) {
      return NextResponse.json({ error: "Votre accès a été révoqué par l'employeur." }, { status: 403 });
    }

    const loginEmail = user.email || `${user.phone?.replace(/[^0-9]/g, "")}@employe.sejoura.com`;
    const internalPassword = `sejoura_emp_${userId.replace(/-/g, "").slice(0, 16)}`;

    // ── ACTION : SET (Première connexion) ──────────────────────────────────────
    if (action === "set") {
      // On ne peut définir le PIN que si first_login est vrai ou pin_code est null
      if (!user.first_login && user.pin_code) {
        return NextResponse.json({
          error: "Un code PIN est déjà défini. Utilisez votre code existant.",
        }, { status: 409 });
      }

      // Hasher le PIN
      const pinHash = hashPin(pin);

      // Créer ou réutiliser le compte Supabase Auth
      let authUserId = user.auth_user_id;

      if (!authUserId) {
        // Créer le compte Supabase Auth
        const { data: newAuthUser, error: signUpError } = await admin.auth.admin.createUser({
          email: loginEmail,
          password: internalPassword,
          email_confirm: true,
          user_metadata: { full_name: user.full_name, role: user.role, phone: user.phone },
        });

        if (signUpError || !newAuthUser.user) {
          // Si l'utilisateur existe déjà dans Auth, récupérer son ID
          const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
          const found = listData?.users?.find((u) => u.email === loginEmail);
          if (found) {
            authUserId = found.id;
            await admin.auth.admin.updateUserById(found.id, { password: internalPassword });
          } else {
            console.error("Erreur API employee-pin: aucun compte Auth trouvé pour", loginEmail, signUpError?.message);
            return NextResponse.json({ error: "Erreur lors de la création du compte." }, { status: 500 });
          }
        } else {
          authUserId = newAuthUser.user.id;
        }
      } else {
        // Synchroniser le mot de passe interne
        await admin.auth.admin.updateUserById(authUserId, { password: internalPassword });
      }

      // Nettoyage des doublons potentiels (trigger handle_new_user)
      const { error: cleanupError } = await admin
        .from("users")
        .delete()
        .eq("auth_user_id", authUserId)
        .neq("id", userId);

      if (cleanupError) {
        console.error("Erreur API employee-pin (nettoyage doublon):", cleanupError.message);
      }

      // Sauvegarder le hash PIN et passer first_login à false
      const { error: updateError } = await admin
        .from("users")
        .update({
          pin_code: pinHash,
          first_login: false,
          auth_user_id: authUserId,
          is_active: true,
          activated_at: user.activated_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Erreur API employee-pin (sauvegarde PIN):", updateError.message);
        return NextResponse.json({ error: "Erreur lors de la sauvegarde du PIN." }, { status: 500 });
      }

      // ── Authentification serveur (ne jamais exposer le mot de passe) ──────
      const sessionResult = await signInEmployeeServerSide(userId, loginEmail, user.phone);
      if (!sessionResult) {
        return NextResponse.json({ error: "Erreur d'authentification." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        session: sessionResult.session,
        fullName: user.full_name,
        role: user.role,
      });
    }

    // ── ACTION : VERIFY (Reconnexion standard) ─────────────────────────────────
    if (action === "verify") {
      if (!user.pin_code) {
        return NextResponse.json({
          error: "Aucun code PIN défini. Veuillez définir votre code lors de votre première connexion.",
        }, { status: 400 });
      }

      const isValid = verifyPin(pin, user.pin_code);
      if (!isValid) {
        return NextResponse.json({ error: "Code secret incorrect." }, { status: 401 });
      }

      // Mettre à jour la date de dernière connexion
      await admin
        .from("users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", userId);

      // ── Authentification serveur (ne jamais exposer le mot de passe) ──────
      const sessionResult = await signInEmployeeServerSide(userId, loginEmail, user.phone);
      if (!sessionResult) {
        return NextResponse.json({ error: "Erreur d'authentification." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        session: sessionResult.session,
        fullName: user.full_name,
        role: user.role,
      });
    }

    return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
  } catch (err) {
    console.error("Erreur API employee-pin:", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
