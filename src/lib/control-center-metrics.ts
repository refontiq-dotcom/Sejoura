import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ============================================================================
// Envoi des métriques de Séjoura vers le Control Center — contrat v1.
// Référence : docs/contracts/metrics-push-v1.md du dépôt refontiq-control-center.
//
// Chaque échec est une ControlCenterPushError qui dit OÙ (stage) et POURQUOI (code),
// sans jamais contenir de secret ni de valeur métier. Cela remplace l'ancien message
// unique « Metrics synchronization failed », derrière lequel une variable manquante,
// un secret refusé et une panne de base étaient indiscernables.
// ============================================================================

export type PushStage = "config" | "collect" | "send" | "rejected";
export type Issue = { path: string; message: string };

export class ControlCenterPushError extends Error {
  readonly stage: PushStage;
  readonly code: string;
  readonly upstreamStatus?: number;
  readonly upstreamCode?: string;
  readonly issues?: Issue[];
  readonly missing?: string[];
  readonly attempts?: number;

  constructor(
    stage: PushStage,
    code: string,
    message: string,
    extra: { upstreamStatus?: number; upstreamCode?: string; issues?: Issue[]; missing?: string[]; attempts?: number } = {}
  ) {
    super(message);
    this.name = "ControlCenterPushError";
    this.stage = stage;
    this.code = code;
    Object.assign(this, extra);
  }
}

type Deps = {
  admin?: SupabaseClient;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  runId?: () => string;
};

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Environnement déclaré à l'envoi ; le Control Center n'enregistre que « production ». */
export function currentEnvironment(): "production" | "preview" | "development" {
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production" || vercel === "preview" || vercel === "development") return vercel;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** Lit la configuration AVANT toute requête : un défaut de configuration se voit tout de suite. */
export function readControlCenterConfig(): { baseUrl: string; secret: string } {
  const url = process.env.CONTROL_CENTER_URL?.trim();
  const secret = process.env.METRICS_PUSH_SECRET?.trim();
  const missing = [!url && "CONTROL_CENTER_URL", !secret && "METRICS_PUSH_SECRET"].filter(Boolean) as string[];
  if (missing.length) {
    throw new ControlCenterPushError(
      "config",
      "configuration_missing",
      `Variable(s) d'environnement manquante(s) : ${missing.join(", ")}`,
      { missing }
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url as string);
  } catch {
    throw new ControlCenterPushError("config", "invalid_url", "CONTROL_CENTER_URL n'est pas une URL valide", {
      missing: ["CONTROL_CENTER_URL"],
    });
  }
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new ControlCenterPushError("config", "insecure_url", "CONTROL_CENTER_URL doit être en https", {
      missing: ["CONTROL_CENTER_URL"],
    });
  }
  return { baseUrl: parsed.origin + parsed.pathname.replace(/\/$/, ""), secret: secret as string };
}

// ---------------------------------------------------------------------------
// Collecte depuis la source de vérité (Supabase de Séjoura).
// NB : la logique de calcul est inchangée dans ce lot ; sa fiabilisation (limites de
// lecture, définitions, filtres de statut) est traitée à part.
// ---------------------------------------------------------------------------
async function collect(admin: SupabaseClient) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [
    { count: tenantCount, error: tenantError },
    { count: activeUserCount, error: userError },
    { data: subscriptions, error: subscriptionError },
    { count: accommodationCount, error: accommodationError },
    { count: activeBookingCount, error: activeBookingError },
    { count: clientCount, error: clientError },
    { data: payments, error: paymentError },
    { data: activeBookings, error: activeBookingsError },
    { data: monthExpenses, error: expenseError },
  ] = await Promise.all([
    admin.from("tenants").select("id", { count: "exact", head: true }).eq("is_suspended", false),
    admin.from("users").select("id", { count: "exact", head: true }).eq("is_active", true).neq("role", "client"),
    admin.from("subscriptions").select("monthly_price, subscription_status").eq("subscription_status", "active"),
    admin.from("accommodations").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("bookings").select("id", { count: "exact", head: true }).in("status", ["confirmed", "checked_in"]),
    admin.from("clients").select("id", { count: "exact", head: true }),
    admin.from("payments").select("amount"),
    admin.from("bookings").select("total_amount, amount_paid").in("status", ["confirmed", "checked_in"]),
    admin.from("expenses").select("amount").gte("expense_date", monthStart),
  ]);

  const failed = (
    [
      ["tenants", tenantError],
      ["users", userError],
      ["subscriptions", subscriptionError],
      ["accommodations", accommodationError],
      ["bookings (actives)", activeBookingError],
      ["clients", clientError],
      ["payments", paymentError],
      ["bookings (impayés)", activeBookingsError],
      ["expenses", expenseError],
    ] as const
  ).filter(([, e]) => Boolean(e));

  if (failed.length) {
    const tables = failed.map(([t]) => t).join(", ");
    const pgCode = (failed[0][1] as { code?: string } | null)?.code ?? "inconnu";
    throw new ControlCenterPushError(
      "collect",
      "source_unavailable",
      `Lecture de la source impossible (${tables}) — code ${pgCode}`
    );
  }

  const sum = (rows: unknown[] | null, pick: (r: never) => number) =>
    (rows ?? []).reduce<number>((s, r) => s + pick(r as never), 0);

  return {
    tenantCount: tenantCount ?? 0,
    activeUserCount: activeUserCount ?? 0,
    activeSubscriptionCount: subscriptions?.length ?? 0,
    accommodationCount: accommodationCount ?? 0,
    activeBookingCount: activeBookingCount ?? 0,
    clientCount: clientCount ?? 0,
    mrr: sum(subscriptions, (r: { monthly_price: unknown }) => Number(r.monthly_price) || 0),
    revenusCollectes: sum(payments, (r: { amount: unknown }) => Number(r.amount) || 0),
    impayesActifs: sum(activeBookings, (r: { total_amount: unknown; amount_paid: unknown }) =>
      Math.max(0, (Number(r.total_amount) || 0) - (Number(r.amount_paid) || 0))
    ),
    depensesMois: sum(monthExpenses, (r: { amount: unknown }) => Number(r.amount) || 0),
  };
}

export type SourceMetrics = Awaited<ReturnType<typeof collect>>;

/** Construit l'envoi v1. Pure : aucune E/S, donc testable. */
export function buildPayload(src: SourceMetrics, meta: { collectedAt: Date; runId: string; environment: ReturnType<typeof currentEnvironment> }) {
  return {
    contract_version: 1 as const,
    projet: "sejoura" as const,
    nom: "Séjoura",
    environment: meta.environment,
    collected_at: meta.collectedAt.toISOString(),
    run_id: meta.runId,
    statut_sante: src.tenantCount === 0 ? ("warning" as const) : ("healthy" as const),
    // Entier exigé par le contrat ; la colonne source est déjà un entier.
    mrr: Math.round(src.mrr),
    comptes_actifs: src.tenantCount,
    details: {
      clients: src.tenantCount,
      utilisateurs_actifs: src.activeUserCount,
      abonnements_actifs: src.activeSubscriptionCount,
      etablissements_actifs: src.accommodationCount,
      reservations_actives: src.activeBookingCount,
      voyageurs: src.clientCount,
      revenus_collectes: src.revenusCollectes,
      impayes_actifs: src.impayesActifs,
      depenses_mois: src.depensesMois,
    },
    // Ancien champ, conservé pour un récepteur qui n'aurait pas encore le contrat v1.
    timestamp: meta.collectedAt.toISOString(),
  };
}

export type MetricsPayload = ReturnType<typeof buildPayload>;

const sanitize = (value: unknown, max = 200) => String(value ?? "").replace(/\s+/g, " ").slice(0, max);

async function readBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await res.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function pushControlCenterMetrics(deps: Deps = {}) {
  const startedAt = Date.now();
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const doFetch = deps.fetchImpl ?? fetch;

  // 1) Configuration d'abord : pas de lecture en base si l'envoi est de toute façon impossible.
  const { baseUrl, secret } = readControlCenterConfig();

  // 2) Source de vérité.
  let src: SourceMetrics;
  try {
    src = await collect(deps.admin ?? createAdminClient());
  } catch (error) {
    if (error instanceof ControlCenterPushError) {
      logger.error("metrics.collection.database_failed", error, { duration_ms: Date.now() - startedAt, code: error.code });
      throw error;
    }
    throw new ControlCenterPushError("collect", "source_error", `Collecte impossible : ${(error as Error)?.name ?? "erreur"}`);
  }

  const payload = buildPayload(src, {
    collectedAt: now(),
    runId: (deps.runId ?? randomUUID)(),
    environment: currentEnvironment(),
  });
  const body = JSON.stringify(payload); // MÊME corps à chaque tentative → relance idempotente

  // 3) Envoi, avec relance sûre (même run_id) sur panne transitoire uniquement.
  let lastTransient: ControlCenterPushError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/api/metrics/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timeout = (error as Error)?.name === "TimeoutError" || (error as Error)?.name === "AbortError";
      lastTransient = new ControlCenterPushError(
        "send",
        timeout ? "timeout" : "network_error",
        timeout ? `Aucune réponse du Control Center en ${REQUEST_TIMEOUT_MS / 1000} s` : "Control Center injoignable",
        { attempts: attempt }
      );
      logger.warn("metrics.send.transient_failure", { attempt, code: lastTransient.code });
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      continue;
    }

    const result = await readBody(response);
    if (response.ok) {
      logger.info("metrics.collection.completed", {
        duration_ms: Date.now() - startedAt,
        http_status: response.status,
        attempts: attempt,
        cc_status: typeof result.status === "string" ? result.status : null,
      });
      return { payload, result, attempts: attempt };
    }

    const upstreamCode = typeof result.code === "string" ? result.code : `http_${response.status}`;
    const issues = Array.isArray(result.issues)
      ? (result.issues as Issue[]).slice(0, 10).map((i) => ({ path: sanitize(i.path, 80), message: sanitize(i.message, 120) }))
      : undefined;
    const rejected = new ControlCenterPushError(
      "rejected",
      "control_center_rejected",
      `Control Center a refusé l'envoi : HTTP ${response.status} (${upstreamCode})`,
      { upstreamStatus: response.status, upstreamCode, issues, attempts: attempt }
    );

    const transient = response.status === 429 || response.status >= 500;
    logger.error("metrics.collection.control_center_rejected", rejected, {
      http_status: response.status,
      upstream_code: upstreamCode,
      attempt,
    });
    if (!transient || attempt === MAX_ATTEMPTS) throw rejected;
    lastTransient = rejected;
    await sleep(RETRY_DELAY_MS);
  }

  throw lastTransient as ControlCenterPushError;
}

/** Traduit une erreur d'envoi en réponse HTTP exploitable par un opérateur. */
export function describePushFailure(error: unknown): { status: number; body: Record<string, unknown> } {
  if (!(error instanceof ControlCenterPushError)) {
    return { status: 500, body: { ok: false, stage: "unknown", code: "internal_error", message: "Erreur interne inattendue" } };
  }
  const status =
    error.stage === "config" ? 503 : error.stage === "collect" ? 500 : error.stage === "send" ? (error.code === "timeout" ? 504 : 502) : 502;
  return {
    status,
    body: {
      ok: false,
      stage: error.stage,
      code: error.code,
      message: error.message,
      ...(error.missing && { missing: error.missing }),
      ...(error.upstreamStatus !== undefined && { upstream_status: error.upstreamStatus, upstream_code: error.upstreamCode }),
      ...(error.issues && { issues: error.issues }),
      ...(error.attempts !== undefined && { attempts: error.attempts }),
    },
  };
}
