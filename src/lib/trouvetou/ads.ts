import { createAdminClient } from "@/lib/supabase/admin";
import type { AdAudience } from "@/lib/ads";

export interface AdvertisementRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  image_url: string;
  redirect_url: string;
  targeting: {
    cities?: string[];
    audience?: AdAudience;
    country?: string;
  };
  duration_days: number;
  amount: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  trouvetou_external_id: string | null;
  trouvetou_is_published: boolean;
}

export interface TrouvetouAdPayload {
  external_id: string;
  type: "advertisement";
  title: string;
  description: string | null;
  image_url: string;
  images: string[];
  redirect_url: string;
  starts_at: string;
  ends_at: string;
  targeting: AdvertisementRow["targeting"];
  is_active: boolean;
  attributes: Record<string, unknown>;
}

export interface TrouvetouAdSyncResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

function adsEndpoint(): { url: string; apiKey: string } | { error: string } {
  const syncUrl = process.env.TROUVETOU_ADS_URL || process.env.TROUVETOU_SYNC_URL;
  const apiKey = process.env.TROUVETOU_API_KEY;
  if (!syncUrl || !apiKey) {
    return {
      error:
        "Configuration manquante : TROUVETOU_ADS_URL (ou TROUVETOU_SYNC_URL) et TROUVETOU_API_KEY doivent être renseignées.",
    };
  }
  return { url: syncUrl, apiKey };
}

function buildPayload(ad: AdvertisementRow, isActive: boolean): TrouvetouAdPayload {
  const externalId = ad.trouvetou_external_id || `ad:${ad.id}`;
  return {
    external_id: externalId,
    type: "advertisement",
    title: ad.title,
    description: ad.description,
    image_url: ad.image_url,
    images: ad.image_url ? [ad.image_url] : [],
    redirect_url: ad.redirect_url,
    starts_at: ad.starts_at ?? new Date().toISOString(),
    ends_at: ad.ends_at ?? new Date().toISOString(),
    targeting: ad.targeting ?? {},
    is_active: isActive,
    attributes: {
      sejoura_ad_id: ad.id,
      tenant_id: ad.tenant_id,
      duration_days: ad.duration_days,
      audience: ad.targeting?.audience ?? "all",
      cities: ad.targeting?.cities ?? [],
    },
  };
}

async function postToTrouvetou(
  payload: TrouvetouAdPayload
): Promise<{ ok: boolean; error?: string }> {
  const cfg = adsEndpoint();
  if ("error" in cfg) return { ok: false, error: cfg.error };

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trouvetou-api-key": cfg.apiKey,
    },
    body: JSON.stringify({ items: [payload] }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    return { ok: false, error: body?.error ?? `Trouvetou a répondu HTTP ${res.status}.` };
  }
  return { ok: true };
}

export async function publishAdvertisementToTrouvetou(
  advertisementId: string
): Promise<TrouvetouAdSyncResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("advertisements")
    .select(
      "id, tenant_id, title, description, image_url, redirect_url, targeting, duration_days, amount, status, starts_at, ends_at, trouvetou_external_id, trouvetou_is_published"
    )
    .eq("id", advertisementId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Publicité introuvable." };
  }

  const ad = data as unknown as AdvertisementRow;
  const externalId = ad.trouvetou_external_id || `ad:${ad.id}`;
  const payload = buildPayload({ ...ad, trouvetou_external_id: externalId }, true);
  const result = await postToTrouvetou(payload);

  await admin
    .from("advertisements")
    .update({
      trouvetou_external_id: externalId,
      trouvetou_synced_at: result.ok ? new Date().toISOString() : null,
      trouvetou_is_published: result.ok,
      trouvetou_sync_error: result.ok ? null : result.error ?? "Échec de publication Trouvetou",
    })
    .eq("id", advertisementId);

  if (!result.ok) return { ok: false, externalId, error: result.error };
  return { ok: true, externalId };
}

export async function unpublishAdvertisementFromTrouvetou(
  advertisementId: string
): Promise<TrouvetouAdSyncResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("advertisements")
    .select(
      "id, tenant_id, title, description, image_url, redirect_url, targeting, duration_days, amount, status, starts_at, ends_at, trouvetou_external_id, trouvetou_is_published"
    )
    .eq("id", advertisementId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Publicité introuvable." };
  }

  const ad = data as unknown as AdvertisementRow;
  if (!ad.trouvetou_external_id && !ad.trouvetou_is_published) {
    return { ok: true, externalId: ad.trouvetou_external_id ?? undefined };
  }

  const payload = buildPayload(ad, false);
  const result = await postToTrouvetou(payload);

  await admin
    .from("advertisements")
    .update({
      trouvetou_is_published: result.ok ? false : ad.trouvetou_is_published,
      trouvetou_unpublished_at: result.ok ? new Date().toISOString() : null,
      trouvetou_sync_error: result.ok ? null : result.error ?? "Échec de dépublication Trouvetou",
    })
    .eq("id", advertisementId);

  if (!result.ok) {
    return { ok: false, externalId: payload.external_id, error: result.error };
  }
  return { ok: true, externalId: payload.external_id };
}

export async function expireAndUnpublishAdvertisements(): Promise<{
  expired: number;
  unpublished: number;
}> {
  const admin = createAdminClient();
  const { data: expiredIds, error } = await admin.rpc("expire_advertisements");
  if (error) {
    console.error("[AdsCron] expire_advertisements failed:", error);
  }

  const { data: toUnpublish } = await admin
    .from("advertisements")
    .select("id")
    .eq("status", "expired")
    .eq("trouvetou_is_published", true);

  let unpublished = 0;
  for (const row of toUnpublish ?? []) {
    const result = await unpublishAdvertisementFromTrouvetou(row.id);
    if (result.ok) unpublished += 1;
  }

  return { expired: typeof expiredIds === "number" ? expiredIds : 0, unpublished };
}
