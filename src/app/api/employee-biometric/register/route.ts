import { NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin } from "@/lib/pin";
import { getDeviceName, getRequestOrigin, getRpId, normalizeTransports } from "@/lib/webauthn";
import { pinRateLimiter, getRateLimitKey } from "@/lib/rate-limit";

/**
 * POST /api/employee-biometric/register
 *
 * Enrôle une clé biométrique (Face ID / Empreinte) pour un employé, via WebAuthn.
 * L'identité est prouvée en re-vérifiant le code PIN que l'employé vient de saisir.
 *
 * Body JSON :
 *   { action: "options", userId, pin }          → génère les options d'enregistrement
 *   { action: "verify",  userId, pin, response }→ vérifie l'attestation et sauvegarde la clé
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userId, pin } = body;

    if (!action || !userId || !pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "Paramètres manquants ou invalides." }, { status: 400 });
    }
    if (action !== "options" && action !== "verify") {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    // ── Rate limiting (brute-force PIN) ──────────────────────────────────────
    const rlKey = getRateLimitKey(request, userId);
    const rl = pinRateLimiter.check(rlKey);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Trop de tentatives. Réessayez dans ${rl.resetIn} secondes.` },
        { status: 429 }
      );
    }

    const admin = createAdminClient();

    const { data: user, error: fetchError } = await admin
      .from("users")
      .select("id, full_name, phone, email, role, is_active, pin_code")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError || !user) {
      return NextResponse.json({ error: "Employé introuvable." }, { status: 404 });
    }
    if (user.is_active === false) {
      return NextResponse.json({ error: "Votre accès a été révoqué par l'employeur." }, { status: 403 });
    }
    if (!user.pin_code) {
      return NextResponse.json({ error: "Aucun code PIN défini." }, { status: 400 });
    }

    const valid = verifyPin(pin, user.pin_code);
    if (!valid) {
      return NextResponse.json({ error: "Code secret incorrect." }, { status: 401 });
    }

    const origin = getRequestOrigin(request);
    const rpID = getRpId(request);
    const deviceName = getDeviceName(request);

    // ── Action : OPTIONS ──────────────────────────────────────────────────────
    if (action === "options") {
      // Clés déjà enregistrées par cet employé (à exclure)
      const { data: existing } = await admin
        .from("user_passkeys")
        .select("credential_id, transports")
        .eq("user_id", userId);

      const excludeCredentials = (existing ?? []).map((p) => ({
        id: p.credential_id as string,
        transports: normalizeTransports(p.transports),
      }));

      const options = await generateRegistrationOptions({
        rpName: "Séjoura",
        rpID,
        userName: user.email || user.phone || `employe-${userId.slice(0, 8)}`,
        userDisplayName: user.full_name,
        timeout: 120_000,
        attestationType: "none",
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
        excludeCredentials,
      });

      // Purge des challenges expirés, puis enregistrement du nouveau challenge
      await admin.from("passkey_challenges").delete().lt("expires_at", new Date().toISOString());
      const { error: challengeError } = await admin.from("passkey_challenges").insert({
        user_id: userId,
        challenge: options.challenge,
        kind: "registration",
      });

      if (challengeError) {
        console.error("Erreur API employee-biometric (challenge):", challengeError.message);
        return NextResponse.json({ error: "Erreur lors de l'enrôlement." }, { status: 500 });
      }

      return NextResponse.json({ options });
    }

    // ── Action : VERIFY ───────────────────────────────────────────────────────
    // Récupérer le challenge d'enregistrement le plus récent non expiré
    const { data: challengeRows } = await admin
      .from("passkey_challenges")
      .select("challenge")
      .eq("user_id", userId)
      .eq("kind", "registration")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    const expectedChallenge = challengeRows?.[0]?.challenge as string | undefined;
    if (!expectedChallenge) {
      return NextResponse.json({ error: "Session d'enrôlement expirée. Réessayez." }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Vérification biométrique échouée." }, { status: 401 });
    }

    const { credential } = verification.registrationInfo;

    // Sauvegarder la clé publique (WebAuthnCredential → format JSONB)
    const { error: insertError } = await admin.from("user_passkeys").insert({
      user_id: userId,
      credential_id: credential.id,
      public_key: JSON.stringify({
        publicKey: Array.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
      }),
      sign_count: credential.counter,
      transports: credential.transports ?? null,
      device_name: deviceName,
      last_used_at: new Date().toISOString(),
    });

    if (insertError) {
      // Credential dupliqué (même authentificateur déjà enregistré) → considéré comme réussi
      if (insertError.code === "23505") {
        await admin
          .from("passkey_challenges")
          .delete()
          .eq("user_id", userId)
          .eq("kind", "registration");
        return NextResponse.json({ success: true, registered: true });
      }
      console.error("Erreur API employee-biometric (insert):", insertError.message);
      return NextResponse.json({ error: "Erreur lors de la sauvegarde de la clé." }, { status: 500 });
    }

    await admin
      .from("passkey_challenges")
      .delete()
      .eq("user_id", userId)
      .eq("kind", "registration");

    return NextResponse.json({ success: true, registered: true, deviceName });
  } catch (err) {
    console.error("Erreur API employee-biometric (register):", err);
    return NextResponse.json({ error: "Erreur serveur 🖥️." }, { status: 500 });
  }
}
