import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
function jsonError(error: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status });
}
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function parseApiKey(request: Request) {
  const raw = request.headers.get("x-api-key") || request.headers.get("authorization") || "";
  return raw.replace("Bearer ", "").trim();
}
async function authenticate(request: Request) {
  const apiKey = parseApiKey(request);
  if (!apiKey) return { admin: null, error: jsonError("Clé API manquante", 401, "API_KEY_MISSING") };
  const admin = createAdminClient();
  const { data: keyData, error } = await admin.from("external_api_keys").select("tenant_id, is_active, scopes, expires_at").eq("api_key", apiKey).maybeSingle();
  if (error || !keyData || !keyData.is_active || (keyData.expires_at && new Date(keyData.expires_at) <= new Date())) return { admin: null, error: jsonError("Clé API invalide", 401, "INVALID_API_KEY") };
  if (!keyData.scopes?.includes("bookings")) return { admin: null, error: jsonError("Cette clé API n’a pas le scope bookings", 403, "MISSING_SCOPE") };
  return { admin, tenantId: keyData.tenant_id };
}
function withinArrivalWindow(checkInDate: string) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const checkIn = new Date(checkInDate + "T00:00:00Z");
  const days = Math.round((checkIn.getTime() - today.getTime()) / 86400000);
  return days >= -1 && days <= 1;
}
export async function POST(request: Request) {
  try {
    const auth = await authenticate(request); if (!auth.admin) return auth.error;
    const admin = auth.admin; const tenantId = auth.tenantId;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.action !== "string" || typeof body.booking_id !== "string") return jsonError("action et booking_id sont requis.");
    const action = body.action;
    if (!["start", "update", "stop", "status"].includes(action)) return jsonError("Action de suivi invalide.", 400, "INVALID_ACTION");
    const { data: booking } = await admin.from("bookings").select("id, tenant_id, accommodation_id, client_id, check_in_date, check_out_date, status").eq("id", body.booking_id).eq("tenant_id", tenantId).maybeSingle();
    if (!booking) return jsonError("Réservation introuvable.", 404, "BOOKING_NOT_FOUND");
    if (["cancelled", "no_show", "checked_out"].includes(booking.status)) return jsonError("Cette réservation ne peut plus être suivie.", 410, "BOOKING_FINISHED");
    const { data: accommodation } = await admin.from("accommodations").select("id, name, latitude, longitude").eq("id", booking.accommodation_id).eq("tenant_id", tenantId).maybeSingle();
    if (!accommodation) return jsonError("Résidence introuvable.", 404, "ACCOMMODATION_NOT_FOUND");
    if (action === "start") {
      if (booking.status !== "confirmed") return jsonError("Le suivi est disponible avant le check-in, lorsque la réservation est confirmée.", 409, "TRACKING_NOT_AVAILABLE");
      if (!withinArrivalWindow(booking.check_in_date)) return jsonError("Le suivi sera disponible à partir de la veille de votre arrivée.", 409, "ARRIVAL_WINDOW_CLOSED");
      const { data: existing } = await admin.from("arrival_tracking_sessions").select("public_token, status, expires_at, started_at").eq("booking_id", booking.id).eq("tenant_id", tenantId).eq("status", "active").maybeSingle();
      if (existing && new Date(existing.expires_at) > new Date()) return NextResponse.json({ success: true, status: "active", token: existing.public_token, started_at: existing.started_at, expires_at: existing.expires_at, destination: { name: accommodation.name, latitude: accommodation.latitude, longitude: accommodation.longitude } });
      const now = new Date();
      const sixHours = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const checkoutLimit = new Date(booking.check_out_date + "T23:59:59Z");
      const expiresAt = sixHours < checkoutLimit ? sixHours : checkoutLimit;
      const token = crypto.randomBytes(32).toString("hex");
      await admin.from("arrival_tracking_sessions").update({ status: "expired", ended_at: now.toISOString() }).eq("booking_id", booking.id).eq("tenant_id", tenantId).eq("status", "active");
      const { data: session, error } = await admin.from("arrival_tracking_sessions").insert({ tenant_id: tenantId, booking_id: booking.id, public_token: token, status: "active", expires_at: expiresAt.toISOString() }).select("public_token, status, started_at, expires_at").single();
      if (error || !session) { console.error("arrival tracking start", error); return jsonError("Impossible d’activer le suivi.", 500, "TRACKING_START_FAILED"); }
      return NextResponse.json({ success: true, status: "active", token: session.public_token, started_at: session.started_at, expires_at: session.expires_at, destination: { name: accommodation.name, latitude: accommodation.latitude, longitude: accommodation.longitude } });
    }
    const token = typeof body.public_token === "string" ? body.public_token : "";
    if (!token) return jsonError("Jeton de suivi requis.", 401, "TRACKING_TOKEN_MISSING");
    const { data: session } = await admin.from("arrival_tracking_sessions").select("id, public_token, status, expires_at, last_latitude, last_longitude, last_updated_at").eq("booking_id", booking.id).eq("tenant_id", tenantId).eq("public_token", token).maybeSingle();
    if (!session) return jsonError("Session de suivi introuvable.", 404, "TRACKING_SESSION_NOT_FOUND");
    if (new Date(session.expires_at) <= new Date() && session.status === "active") { await admin.from("arrival_tracking_sessions").update({ status: "expired", ended_at: new Date().toISOString() }).eq("id", session.id); return jsonError("La session de suivi a expiré.", 410, "TRACKING_EXPIRED"); }
    if (action === "status") return NextResponse.json({ success: true, status: session.status, last_updated_at: session.last_updated_at, latitude: session.last_latitude, longitude: session.last_longitude, destination: { name: accommodation.name, latitude: accommodation.latitude, longitude: accommodation.longitude } });
    if (session.status !== "active") return jsonError("Le partage de position est déjà terminé.", 409, "TRACKING_NOT_ACTIVE");
    if (action === "stop") { const endedAt = new Date().toISOString(); await admin.from("arrival_tracking_sessions").update({ status: "stopped", ended_at: endedAt, last_updated_at: endedAt }).eq("id", session.id); return NextResponse.json({ success: true, status: "stopped" }); }
    const latitude = Number(body.latitude); const longitude = Number(body.longitude);
    const accuracy = body.accuracy == null ? null : Number(body.accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return jsonError("Latitude invalide.", 400, "INVALID_LATITUDE");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return jsonError("Longitude invalide.", 400, "INVALID_LONGITUDE");
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000)) return jsonError("Précision GPS invalide.", 400, "INVALID_ACCURACY");
    const now = new Date(); const previousTimestamp = session.last_updated_at ? new Date(session.last_updated_at) : null;
    let speedKmh: number | null = null;
    if (previousTimestamp && session.last_latitude != null && session.last_longitude != null) {
      const seconds = (now.getTime() - previousTimestamp.getTime()) / 1000;
      if (seconds >= 3 && seconds <= 300) { const distanceKm = haversineKm(Number(session.last_latitude), Number(session.last_longitude), latitude, longitude); const measured = distanceKm / (seconds / 3600); if (Number.isFinite(measured)) speedKmh = Math.min(120, Math.max(0, measured)); }
    }
    const updatedAt = now.toISOString();
    const { error: updateError } = await admin.from("arrival_tracking_sessions").update({ last_latitude: latitude, last_longitude: longitude, last_accuracy: accuracy, last_speed_kmh: speedKmh, last_updated_at: updatedAt }).eq("id", session.id);
    if (updateError) { console.error("arrival tracking update", updateError); return jsonError("Impossible d’enregistrer la position.", 500, "TRACKING_UPDATE_FAILED"); }
    const distanceKm = accommodation.latitude != null && accommodation.longitude != null ? haversineKm(latitude, longitude, Number(accommodation.latitude), Number(accommodation.longitude)) : null;
    return NextResponse.json({ success: true, status: "active", last_updated_at: updatedAt, distance_km: distanceKm });
  } catch (error) { console.error("POST /api/v1/external/arrival-tracking error:", error); return jsonError("Erreur interne.", 500, "INTERNAL_ERROR"); }
}
export async function GET() { return jsonError("Utilisez POST /api/v1/external/arrival-tracking.", 405, "METHOD_NOT_ALLOWED"); }