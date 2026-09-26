import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

    const admin = createAdminClient();
    const { data: userRow } = await admin.from("users").select("id, tenant_id").eq("auth_user_id", authUser.id).maybeSingle();
    if (!userRow?.tenant_id) return NextResponse.json({ error: "Compte non rattaché à un établissement." }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const accommodationId = searchParams.get("accommodationId");
    let query = admin.from("arrival_tracking_sessions").select(
      "id, booking_id, status, started_at, expires_at, last_latitude, last_longitude, last_accuracy, last_speed_kmh, last_updated_at, booking:bookings!inner(id, booking_code, tenant_id, accommodation_id, check_in_date, check_out_date, status, client:clients(full_name, phone)), accommodation:accommodations!inner(id, name, latitude, longitude)"
    ).eq("tenant_id", userRow.tenant_id).eq("status", "active").gt("expires_at", new Date().toISOString()).order("last_updated_at", { ascending: false });

    if (accommodationId) query = query.eq("booking.accommodation_id", accommodationId);
    const { data, error } = await query;
    if (error) { console.error("arrival tracking dashboard", error); return NextResponse.json({ error: "Impossible de charger les arrivées en cours." }, { status: 500 }); }

    const arrivals = (data ?? []).map((session: any) => {
      const accommodation = session.accommodation; const booking = session.booking;
      const lat = session.last_latitude == null ? null : Number(session.last_latitude);
      const lon = session.last_longitude == null ? null : Number(session.last_longitude);
      const destLat = accommodation?.latitude == null ? null : Number(accommodation.latitude);
      const destLon = accommodation?.longitude == null ? null : Number(accommodation.longitude);
      const distanceKm = lat != null && lon != null && destLat != null && destLon != null ? haversineKm(lat, lon, destLat, destLon) : null;
      const measuredSpeed = session.last_speed_kmh == null ? null : Number(session.last_speed_kmh);
      const usableSpeed = measuredSpeed != null && measuredSpeed >= 8 ? Math.min(80, measuredSpeed) : 30;
      const etaMinutes = distanceKm == null ? null : Math.max(1, Math.round((distanceKm / usableSpeed) * 60));
      return {
        id: session.id, booking_id: session.booking_id, booking_code: booking?.booking_code ?? null,
        client_name: booking?.client?.full_name ?? "Client", client_phone: booking?.client?.phone ?? null,
        accommodation_id: accommodation?.id ?? null, accommodation_name: accommodation?.name ?? "Résidence",
        check_in_date: booking?.check_in_date ?? null, latitude: lat, longitude: lon,
        destination_latitude: destLat, destination_longitude: destLon,
        accuracy: session.last_accuracy == null ? null : Number(session.last_accuracy),
        speed_kmh: measuredSpeed, distance_km: distanceKm, eta_minutes: etaMinutes,
        last_updated_at: session.last_updated_at, started_at: session.started_at,
      };
    });
    return NextResponse.json({ arrivals });
  } catch (error) {
    console.error("GET /api/arrival-tracking error:", error);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }
}