import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrouvetouEligible } from "@/lib/trouvetou/eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/trouvetou/debug
 * Diagnostic : liste tous les types de chambre avec is_listed_on_trouvetou = true
 * et explique pourquoi chacun est inclus, exclu, ou masqué (is_available = false)
 * dans le catalogue Trouvetou.
 */
export async function GET(request: Request) {
  const secret = process.env.TROUVETOU_SYNC_SECRET;
  const provided = request.headers.get("x-sync-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Clés API actives par tenant
  const { data: activeKeys } = await admin
    .from("external_api_keys")
    .select("tenant_id, api_key")
    .eq("is_active", true);

  const apiKeyByTenant = new Map<string, string>();
  for (const k of activeKeys ?? []) {
    if (k.tenant_id && !apiKeyByTenant.has(k.tenant_id)) {
      apiKeyByTenant.set(k.tenant_id, k.api_key);
    }
  }

  // 2. Tous les types de chambre publiés
  const { data, error } = await admin
    .from("room_types")
    .select(`
      id, name, is_listed_on_trouvetou, featured_images,
      accommodations!inner (
        id, tenant_id, name, is_active,
        tenants!inner (
          company_name,
          subscriptions!inner ( status )
        )
      )
    `)
    .eq("is_listed_on_trouvetou", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 3. Chambres avec statut
  const allTypeIds = (data ?? []).map((r: { id: string }) => r.id);
  const { data: rooms } = await admin
    .from("rooms")
    .select("id, room_type_id, status")
    .in(
      "room_type_id",
      allTypeIds.length > 0 ? allTypeIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const roomCountByType = new Map<string, number>();
  const roomsByType = new Map<string, { id: string; status: string | null }[]>();
  const occupiedRoomIds = new Set<string>();

  for (const r of rooms ?? []) {
    roomCountByType.set(r.room_type_id, (roomCountByType.get(r.room_type_id) ?? 0) + 1);
    const list = roomsByType.get(r.room_type_id) ?? [];
    list.push({ id: r.id, status: r.status });
    roomsByType.set(r.room_type_id, list);
    if (r.status === "occupied") occupiedRoomIds.add(r.id);
  }

  // 4. Réservations actives en cours (confirmed ou checked_in)
  const allRoomIds = (rooms ?? []).map((r) => r.id);
  const now = new Date().toISOString();
  if (allRoomIds.length > 0) {
    const { data: activeBookings } = await admin
      .from("bookings")
      .select("room_id")
      .in("room_id", allRoomIds)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", now)
      .gte("check_out", now);
    for (const b of activeBookings ?? []) {
      occupiedRoomIds.add(b.room_id);
    }
  }

  // 5. Analyser chaque type
  type AnyRow = Record<string, unknown>;

  const result = (data ?? []).map((rt: AnyRow) => {
    const acc = rt.accommodations as AnyRow;
    const subs = (acc?.tenants as AnyRow)?.subscriptions as AnyRow[] | AnyRow | null;
    const subscriptionActive = Array.isArray(subs)
      ? subs.some((s) => s.status === "active")
      : (subs as AnyRow | null)?.status === "active";

    const checks = {
      hasActiveApiKey: !!acc?.tenant_id && apiKeyByTenant.has(acc.tenant_id as string),
      accommodationActive: acc?.is_active === true,
      subscriptionActive: subscriptionActive ?? false,
      hasPhoto: Array.isArray(rt.featured_images) && (rt.featured_images as string[]).length > 0,
      hasRoom: (roomCountByType.get(rt.id as string) ?? 0) > 0,
    };

    const eligible =
      checks.hasActiveApiKey &&
      isTrouvetouEligible({
        accommodationActive: checks.accommodationActive,
        subscriptionActive: checks.subscriptionActive,
        hasPhoto: checks.hasPhoto,
        hasRoom: checks.hasRoom,
      });

    const blockedBy = Object.entries(checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    const typeRooms = roomsByType.get(rt.id as string) ?? [];
    const isAvailable = typeRooms.some((r) => !occupiedRoomIds.has(r.id));
    const occupiedInType = typeRooms
      .filter((r) => occupiedRoomIds.has(r.id))
      .map((r) => r.id);

    return {
      room_type_id: rt.id,
      room_type_name: rt.name,
      accommodation_name: acc?.name,
      company: (acc?.tenants as AnyRow)?.company_name,
      external_id: `rt:${rt.id}`,
      eligible,
      blockedBy: eligible ? [] : blockedBy,
      checks,
      room_count: roomCountByType.get(rt.id as string) ?? 0,
      is_available: isAvailable,
      // true = annonce visible sur Trouvetou, false = masquée
      will_show_on_trouvetou: eligible && isAvailable,
      occupied_rooms_count: occupiedInType.length,
    };
  });

  const visibleOnTrouvetou = result.filter((r) => r.will_show_on_trouvetou);
  const hiddenUnavailable = result.filter((r) => r.eligible && !r.is_available);
  const blockedIneligible = result.filter((r) => !r.eligible);

  return NextResponse.json({
    summary: {
      total_listed: result.length,
      visible_on_trouvetou: visibleOnTrouvetou.length,
      hidden_unavailable: hiddenUnavailable.length,
      blocked_ineligible: blockedIneligible.length,
    },
    visible_on_trouvetou: visibleOnTrouvetou,
    // Annonces éligibles mais masquées car toutes les chambres sont occupées/réservées
    hidden_unavailable: hiddenUnavailable,
    // Annonces bloquées pour non-conformité (pas de photo, pas de chambre, etc.)
    blocked_ineligible: blockedIneligible,
  });
}
