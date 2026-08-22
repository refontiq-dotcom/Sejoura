import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlan } from "@/lib/subscription-plans";

/**
 * POST /api/stay/session
 *
 * Crée (ou réutilise) la session d'accès client pour une réservation.
 * Réservé à la formule Entreprise. Retourne le token sécurisé et l'URL
 * à partager au client.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: userRow } = await admin
      .from("users")
      .select("id, tenant_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!userRow?.tenant_id) {
      return NextResponse.json(
        { error: "Compte non rattaché à un établissement." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId requis." }, { status: 400 });
    }

    const { data: booking } = await admin
      .from("bookings")
      .select("id, tenant_id, client_id, check_out_date, check_out_time, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) {
      return NextResponse.json({ error: "Réservation introuvable." }, { status: 404 });
    }
    if (booking.tenant_id !== userRow.tenant_id) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    // Formule Entreprise uniquement
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("tenant_id", booking.tenant_id)
      .maybeSingle();
    if (!subscription || normalizePlan(subscription.plan) !== "entreprise") {
      return NextResponse.json(
        { error: "L'espace client est réservé à la formule Entreprise." },
        { status: 403 }
      );
    }

    // Refuser la création de session pour les réservations terminées
    if (
      booking.status === "cancelled" ||
      booking.status === "no_show" ||
      booking.status === "checked_out"
    ) {
      return NextResponse.json(
        { error: "Cette réservation est terminée. L'espace client n'est plus disponible." },
        { status: 410 }
      );
    }

    // Réutiliser une session active existante : le lien déjà partagé reste valide
    // (sa date d'expiration est resynchronisée par le trigger côté base lors
    // des prolongations de séjour).
    const { data: existing } = await admin
      .from("client_sessions")
      .select("id, access_token")
      .eq("booking_id", booking.id)
      .eq("is_active", true)
      .maybeSingle();

    let token: string;

    if (existing) {
      token = existing.access_token;
    } else {
      token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(
        `${booking.check_out_date}T${booking.check_out_time || "11:00"}`
      ).toISOString();

      const { data: inserted, error: insertErr } = await admin
        .from("client_sessions")
        .insert({
          tenant_id: booking.tenant_id,
          booking_id: booking.id,
          client_id: booking.client_id,
          access_token: token,
          expires_at: expiresAt,
          is_active: true,
        })
        .select("id, access_token")
        .single();

      if (insertErr || !inserted) {
        return NextResponse.json(
          { error: "Impossible de créer la session." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      token,
      url: `/stay?token=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
