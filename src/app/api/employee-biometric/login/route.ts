import { NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin, getRpId, normalizeTransports } from "@/lib/webauthn";
import { signInEmployeeServerSide } from "@/lib/employee-auth";

/**
 * POST /api/employee-biometric/login
 *
 * Authentifie un employé via une clé biométrique (Face ID / Empreinte) WebAuthn.
 * ⚠️  Ne retourne JAMAIS le internalPassword — l'auth serveur retourne les tokens de session.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userId } = body;

    if (!action || !userId) {
      return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
    }
    if (action !== "options" && action !== "verify") {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: user, error: fetchError } = await admin
      .from("users")
      .select("id, full_name, phone, email, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError || !user) {
      return NextResponse.json({ error: "Employé introuvable." }, { status: 404 });
    }
    if (user.is_active === false) {
      return NextResponse.json({ error: "Votre accès a été révoqué par l'employeur." }, { status: 403 });
    }

    const origin = getRequestOrigin(request);
    const rpID = getRpId(request);

    // ── Action : OPTIONS ──────────────────────────────────────────────────────
    if (action === "options") {
      const { data: passkeys } = await admin
        .from("user_passkeys")
        .select("credential_id, transports")
        .eq("user_id", userId);

      if (!passkeys || passkeys.length === 0) {
        return NextResponse.json({ registered: false }, { status: 409 });
      }

      const allowCredentials = passkeys.map((p) => ({
        id: p.credential_id as string,
        transports: normalizeTransports(p.transports),
      }));

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        timeout: 120_000,
        userVerification: "required",
      });

      // Purge des challenges expirés, puis enregistrement du nouveau challenge
      await admin.from("passkey_challenges").delete().lt("expires_at", new Date().toISOString());
      const { error: challengeError } = await admin.from("passkey_challenges").insert({
        user_id: userId,
        challenge: options.challenge,
        kind: "authentication",
      });

      if (challengeError) {
        console.error("Erreur API employee-biometric (challenge login):", challengeError.message);
        return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
      }

      return NextResponse.json({ options });
    }

    // ── Action : VERIFY ───────────────────────────────────────────────────────
    const credentialId = body.response?.id as string | undefined;
    if (!credentialId) {
      return NextResponse.json({ error: "Réponse biométrique invalide." }, { status: 400 });
    }

    // Credential correspondant à la réponse
    const { data: passkeys } = await admin
      .from("user_passkeys")
      .select("id, credential_id, public_key, sign_count")
      .eq("user_id", userId)
      .eq("credential_id", credentialId)
      .limit(1);

    const passkey = passkeys?.[0];
    if (!passkey) {
      return NextResponse.json({ error: "Clé biométrique inconnue." }, { status: 401 });
    }

    // Challenge d'authentification le plus récent non expiré
    const { data: challengeRows } = await admin
      .from("passkey_challenges")
      .select("challenge")
      .eq("user_id", userId)
      .eq("kind", "authentication")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    const expectedChallenge = challengeRows?.[0]?.challenge as string | undefined;
    if (!expectedChallenge) {
      return NextResponse.json({ error: "Session biométrique expirée. Réessayez." }, { status: 400 });
    }

    // Reconstruire le credential WebAuthn stocké
    let stored: { publicKey: number[]; counter: number; transports?: string[] };
    try {
      stored = JSON.parse(passkey.public_key as string);
    } catch {
      return NextResponse.json({ error: "Clé biométrique corrompue." }, { status: 500 });
    }

    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credential_id,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: normalizeTransports(stored.transports),
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Authentification biométrique échouée." }, { status: 401 });
    }

    const { newCounter } = verification.authenticationInfo;

    await admin
      .from("user_passkeys")
      .update({ sign_count: newCounter, last_used_at: new Date().toISOString() })
      .eq("id", passkey.id);

    await admin.from("passkey_challenges").delete().eq("user_id", userId).eq("kind", "authentication");

    // Mettre à jour la date de dernière connexion
    await admin
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", userId);

    // ── Authentification serveur (ne jamais exposer le mot de passe) ────────
    const sessionResult = await signInEmployeeServerSide(userId, user.email, user.phone);
    if (!sessionResult) {
      return NextResponse.json({ error: "Erreur d'authentification." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      session: sessionResult.session,
      role: user.role,
      fullName: user.full_name,
      userId,
    });
  } catch (err) {
    console.error("Erreur API employee-biometric (login):", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
