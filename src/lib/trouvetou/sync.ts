import { createAdminClient } from "@/lib/supabase/admin";
import { isTrouvetouEligible } from "@/lib/trouvetou/eligibility";

/**
 * SÉJOURA → TROUVETOU — Synchronisation des annonces
 *
 * Construit le payload attendu par l'API d'ingestion Trouvetou
 * (`POST /api/v1/sync`) à partir des données de Séjoura :
 *   room_types (chambres publiables) + accommodations + tenants + subscriptions.
 *
 * Seules les chambres des établissements actifs dont l'abonnement est
 * `active` ET dont l'interrupteur Trouvetou est ON (`is_listed_on_trouvetou`)
 * avec au moins une photo sont envoyées. L'UPSERT côté Trouvetou repose sur le
 * couple (provider_id, external_id) — `external_id = "rt:<room_type_id>"` est
 * stable, ce qui rend l'envoi idempotent.
 */

export interface TrouvetouSyncItem {
  external_id: string;
  title: string;
  description: string | null;
  city: string | null;
  base_price: number;
  images: string[];
  attributes: Record<string, unknown>;
  is_available: boolean;
}

export interface TrouvetouSyncResult {
  ok: boolean;
  sent: number;
  response?: {
    ok: boolean;
    processed: number;
    inserted: number;
    updated: number;
  };
  error?: string;
}

interface SyncRow {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  capacity: number;
  amenities: string[] | null;
  featured_images: string[] | null;
  accommodations: {
    name: string;
    description: string | null;
    city: string | null;
    is_active: boolean;
    tenants: {
      company_name: string | null;
      logo_url: string | null;
      subscriptions: { status: string }[] | null;
    } | null;
  };
}

/** Construit la liste d'annonces à publier sur Trouvetou. */
async function buildPayload(): Promise<{ items: TrouvetouSyncItem[]; error: string | null }> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("room_types")
    .select(
      `
      id,
      name,
      description,
      base_price,
      capacity,
      amenities,
      featured_images,
      accommodations!inner (
        name,
        description,
        city,
        is_active,
        tenants!inner (
          company_name,
          logo_url,
          subscriptions!inner (
            status
          )
        )
      )
    `
    )
    .eq("is_listed_on_trouvetou", true)
    .eq("accommodations.is_active", true)
    .eq("accommodations.tenants.subscriptions.status", "active");

  if (error) {
    return { items: [], error: `Lecture de la base Séjoura : ${error.message}` };
  }

  const rows = (data ?? []) as unknown as SyncRow[];
  const roomTypeIds = rows.map((row) => row.id);

  // ── Disponibilité en temps réel ─────────────────────────────────────────
  // Un type est « disponible » si au moins une de ses chambres n'est ni
  // réservée (booking actif qui chevauche l'instant présent) ni occupée.
  const now = new Date();
  const occupiedRoomIds = new Set<string>();
  const roomStatusByType = new Map<string, { id: string; status: string | null }[]>();

  if (roomTypeIds.length > 0) {
    const { data: rooms } = await admin
      .from("rooms")
      .select("id, status, room_type_id")
      .in("room_type_id", roomTypeIds);

    for (const room of rooms ?? []) {
      const list = roomStatusByType.get(room.room_type_id) ?? [];
      list.push({ id: room.id, status: room.status });
      roomStatusByType.set(room.room_type_id, list);
      if (room.status === "occupied") occupiedRoomIds.add(room.id);
    }

    const roomIds = (rooms ?? []).map((r) => r.id);
    if (roomIds.length > 0) {
      const { data: bookings } = await admin
        .from("bookings")
        .select("room_id, check_in_date, check_out_date")
        .in("room_id", roomIds)
        .in("status", ["confirmed", "checked_in"])
        .lt("check_in_date", now.toISOString())
        .gt("check_out_date", now.toISOString());
      for (const booking of bookings ?? []) occupiedRoomIds.add(booking.room_id);
    }
  }

  const items: TrouvetouSyncItem[] = rows
    .filter((row) =>
      isTrouvetouEligible({
        accommodationActive: row.accommodations?.is_active === true,
        subscriptionActive:
          row.accommodations?.tenants?.subscriptions?.some((s) => s.status === "active") ??
          false,
        hasPhoto: (row.featured_images ?? []).length > 0,
        hasRoom: (roomStatusByType.get(row.id) ?? []).length > 0,
      })
    )
    .map((row) => {
      const accommodation = row.accommodations;
      const tenant = accommodation.tenants;
      const logoUrl = tenant?.logo_url;
      const featuredImages = Array.isArray(row.featured_images)
        ? row.featured_images.filter((url) => typeof url === "string" && url.length > 0)
        : [];
      const images =
        featuredImages.length > 0
          ? featuredImages
          : logoUrl && logoUrl.length > 0
            ? [logoUrl]
            : [];
      const typeRooms = roomStatusByType.get(row.id) ?? [];
      const isAvailable = typeRooms.some((r) => !occupiedRoomIds.has(r.id));

      return {
        external_id: `rt:${row.id}`,
        title: `${row.name} — ${accommodation.name}`,
        description: row.description ?? accommodation.description ?? null,
        city: accommodation.city,
        base_price: row.base_price,
        images,
        attributes: {
          capacity: row.capacity,
          amenities: Array.isArray(row.amenities) ? row.amenities : [],
        },
        is_available: isAvailable,
      };
    });

  return { items, error: null };
}

/** Envoie les annonces de Séjoura vers l'API d'ingestion Trouvetou. */
export async function syncListingsToTrouvetou(): Promise<TrouvetouSyncResult> {
  const syncUrl = process.env.TROUVETOU_SYNC_URL;
  const apiKey = process.env.TROUVETOU_API_KEY;

  if (!syncUrl || !apiKey) {
    return {
      ok: false,
      sent: 0,
      error:
        "Configuration manquante : TROUVETOU_SYNC_URL et TROUVETOU_API_KEY doivent être renseignées dans .env.local.",
    };
  }

  const { items, error } = await buildPayload();
  if (error) {
    return { ok: false, sent: 0, error };
  }

  const res = await fetch(syncUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trouvetou-api-key": apiKey,
    },
    body: JSON.stringify({ items }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as TrouvetouSyncResult["response"] & {
    error?: string;
  } | null;

  if (!res.ok) {
    return {
      ok: false,
      sent: items.length,
      error: body?.error ?? `Trouvetou a répondu HTTP ${res.status}.`,
    };
  }

  return {
    ok: true,
    sent: items.length,
    response: body ?? { ok: true, processed: items.length, inserted: 0, updated: 0 },
  };
}
