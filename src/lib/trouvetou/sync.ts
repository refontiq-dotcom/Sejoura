import { createAdminClient } from "@/lib/supabase/admin";

/**
 * SÉJOURA → TROUVETOU — Synchronisation des annonces
 *
 * Construit le payload attendu par l'API d'ingestion Trouvetou
 * (`POST /api/v1/sync`) à partir des données de Séjoura :
 *   room_types (chambres publiables) + accommodations + tenants + subscriptions.
 *
 * Seules les chambres des établissements actifs dont l'abonnement est
 * `active` sont envoyées. L'UPSERT côté Trouvetou repose sur le couple
 * (provider_id, external_id) — `external_id = "rt:<room_type_id>"` est
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
  accommodations: {
    name: string;
    description: string | null;
    city: string | null;
    tenants: {
      company_name: string | null;
      logo_url: string | null;
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
      accommodations!inner (
        name,
        description,
        city,
        tenants!inner (
          company_name,
          logo_url
        )
      )
    `
    )
    .eq("accommodations.is_active", true)
    .eq("accommodations.tenants.subscriptions.status", "active");

  if (error) {
    return { items: [], error: `Lecture de la base Séjoura : ${error.message}` };
  }

  const rows = (data ?? []) as unknown as SyncRow[];

  const items: TrouvetouSyncItem[] = rows.map((row) => {
    const accommodation = row.accommodations;
    const tenant = accommodation.tenants;
    const logoUrl = tenant?.logo_url;

    return {
      external_id: `rt:${row.id}`,
      title: `${row.name} — ${accommodation.name}`,
      description: row.description ?? accommodation.description ?? null,
      city: accommodation.city,
      base_price: row.base_price,
      images: logoUrl && logoUrl.length > 0 ? [logoUrl] : [],
      attributes: {
        capacity: row.capacity,
        amenities: Array.isArray(row.amenities) ? row.amenities : [],
      },
      is_available: true,
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
