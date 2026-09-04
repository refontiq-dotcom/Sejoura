import { randomBytes } from "node:crypto";
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
 * avec au moins une photo sont envoyées. De plus, le tenant doit disposer
 * d'au moins une clé API externe ACTIVE (`external_api_keys.is_active = true`) :
 * une résidence ne diffuse sur Trouvetou que si sa clé API est active.
 * L'UPSERT côté Trouvetou repose sur le couple (provider_id, external_id) —
 * `external_id = "rt:<room_type_id>"` est stable, ce qui rend l'envoi idempotent.
 *
 * La clé API active du tenant est transmise dans `attributes.sejoura_api_key`
 * pour permettre la création de réservations depuis le portail (POST /bookings).
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
  category_slug?: string | null;
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
    tenant_id: string;
    name: string;
    description: string | null;
    city: string | null;
    is_active: boolean;
    tenants: {
      company_name: string | null;
      logo_url: string | null;
      subscriptions:
        | { status: string }[]
        | { status: string }
        | null;
    } | null;
  };
}

/** Construit la liste d'annonces à publier sur Trouvetou. */
async function buildPayload(): Promise<{ items: TrouvetouSyncItem[]; error: string | null }> {
  const admin = createAdminClient();

  // 1. Clés API externes actives par tenant — requête plate : la FK
  //    `tenants → external_api_keys` n'est pas garantie en base, on joint en JS.
  const { data: activeKeys, error: keysError } = await admin
    .from("external_api_keys")
    .select("tenant_id, api_key")
    .eq("is_active", true);

  if (keysError) {
    return { items: [], error: `Lecture des clés API Séjoura : ${keysError.message}` };
  }

  const apiKeyByTenant = new Map<string, string>();
  for (const k of activeKeys ?? []) {
    if (k.tenant_id && !apiKeyByTenant.has(k.tenant_id)) {
      apiKeyByTenant.set(k.tenant_id, k.api_key);
    }
  }

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
        tenant_id,
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

  // ── Auto-provision des clés API ─────────────────────────────────────────
  // Certains tenants ont activé "Publier sur Trouvetou" mais n'ont pas encore
  // de clé API externe. On la génère automatiquement pour que la synchro
  // ne les ignore plus.
  const tenantsNeedingKeys = new Set<string>();
  for (const row of rows) {
    const tId = row.accommodations?.tenant_id;
    if (tId && !apiKeyByTenant.has(tId)) {
      tenantsNeedingKeys.add(tId);
    }
  }

  if (tenantsNeedingKeys.size > 0) {
    const newKeysData = Array.from(tenantsNeedingKeys).map((tId) => ({
      tenant_id: tId,
      name: "Clé API Trouvetou (Générée automatiquement)",
      api_key: randomBytes(24).toString("hex"),
      scopes: ["availability", "bookings"],
      is_active: true,
    }));

    const { data: insertedKeys, error: insertError } = await admin
      .from("external_api_keys")
      .insert(newKeysData)
      .select("tenant_id, api_key");

    if (!insertError && insertedKeys) {
      for (const k of insertedKeys) {
        apiKeyByTenant.set(k.tenant_id, k.api_key);
      }
    } else {
      console.error("Erreur auto-provisioning clés API:", insertError);
    }
  }

  const roomTypeIds = rows.map((row) => row.id);

  // ── Disponibilité ──────────────────────────────────────────────────────────
  // `is_available` envoyé à Trouvetou = "ce type possède au moins une chambre
  // physique et peut accepter des réservations futures".
  //
  // On ne masque PAS une fiche parce que toutes ses chambres sont occupées
  // MAINTENANT : la vraie vérification de disponibilité sur des dates précises
  // est déléguée à POST /api/v1/external/bookings qui renvoie 409 si aucune
  // chambre n'est libre sur la période demandée.
  //
  // On calcule quand même le nombre de chambres non occupées *maintenant* pour
  // l'exposer dans `attributes.available_rooms_count` (information temps-réel).
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
        .select("room_id")
        .in("room_id", roomIds)
        .in("status", ["confirmed", "checked_in"])
        .lt("check_in_date", now.toISOString())
        .gt("check_out_date", now.toISOString());
      for (const booking of bookings ?? []) occupiedRoomIds.add(booking.room_id);
    }
  }

  const items: TrouvetouSyncItem[] = rows
    .filter((row) => {
      // Gating : le tenant doit disposer d'une clé API externe active (résidence
      // diffusée seulement si sa clé API est active).
      const hasActiveApiKey =
        !!row.accommodations?.tenant_id &&
        apiKeyByTenant.has(row.accommodations.tenant_id);

      // PostgREST replie un embed à une seule ligne en objet (pas en tableau) ;
      // on normalise donc `subscriptions` avant d'appeler `.some()`.
      const subscriptions = row.accommodations?.tenants?.subscriptions ?? null;
      const subscriptionActive = Array.isArray(subscriptions)
        ? subscriptions.some((s) => s.status === "active")
        : subscriptions?.status === "active";

      return (
        hasActiveApiKey &&
        isTrouvetouEligible({
          accommodationActive: row.accommodations?.is_active === true,
          subscriptionActive,
          hasPhoto: (row.featured_images ?? []).length > 0,
          hasRoom: (roomStatusByType.get(row.id) ?? []).length > 0,
        })
      );
    })
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
      // `is_available` = le type possède au moins une chambre physique.
      // Que ces chambres soient toutes occupées *maintenant* n'a pas d'importance :
      // un client peut réserver pour une date future et le portail vérifiera
      // la disponibilité réelle sur ses dates via POST /external/bookings.
      const isAvailable = typeRooms.length > 0;
      // Nombre de chambres libres à cet instant (info temps-réel dans attributes).
      const availableNow = typeRooms.filter((r) => !occupiedRoomIds.has(r.id)).length;

      // Clé API Séjoura du tenant (active — garantie par le filtre ci-dessus).
      // Stockée côté portail pour permettre la création de réservations (POST /bookings).
      const sejouraApiKey = row.accommodations?.tenant_id
        ? (apiKeyByTenant.get(row.accommodations.tenant_id) ?? null)
        : null;

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
          total_rooms: typeRooms.length,
          available_rooms_now: availableNow,
          ...(sejouraApiKey ? { sejoura_api_key: sejouraApiKey } : {}),
        },
        is_available: isAvailable,
        category_slug: accommodation.description === "bnb" ? "residence" : "hotel",
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

  if (items.length === 0) {
    return {
      ok: false,
      sent: 0,
      error:
        "Aucune annonce éligible à synchroniser : vérifiez l'abonnement actif, la photo, une chambre physique et la clé API externe du tenant.",
    };
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
