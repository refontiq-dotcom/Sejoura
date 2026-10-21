import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getRequestId: () => "req-test",
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ControlCenterPushError,
  buildPayload,
  describePushFailure,
  pushControlCenterMetrics,
  readControlCenterConfig,
} from "@/lib/control-center-metrics";

const SECRET = "secret-de-test-ne-doit-jamais-apparaitre";
const RUN = "5a0f2c1e-8c53-4b3a-9d55-0d6f4f1b2a10";
const NOW = new Date("2026-10-19T01:00:00.123Z");

type Fixture = Record<string, { count?: number; data?: unknown[]; error?: { code: string; message: string } | null }>;

/** Faux client Supabase de Séjoura, alimenté par des données connues. */
function fakeAdmin(fixture: Fixture, bookingsData: unknown[] = []) {
  const calls: string[] = [];
  const client = {
    from: (table: string) => {
      calls.push(table);
      let head = false;
      let cols = "";
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "neq", "in", "gte"]) chain[m] = () => chain;
      chain.select = (c: string, o?: { head?: boolean }) => ((cols = c), (head = Boolean(o?.head)), chain);
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        const f = fixture[table] ?? {};
        const isBookingsData = table === "bookings" && !head && cols.includes("total_amount");
        const out = isBookingsData
          ? { data: bookingsData, error: f.error ?? null }
          : head
            ? { count: f.count ?? 0, error: f.error ?? null }
            : { data: f.data ?? [], error: f.error ?? null };
        return Promise.resolve(out).then(res, rej);
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const GOOD: Fixture = {
  tenants: { count: 17 },
  users: { count: 29 },
  subscriptions: { data: [{ monthly_price: 100000 }, { monthly_price: 25000 }] },
  accommodations: { count: 18 },
  bookings: { count: 10 },
  clients: { count: 46 },
  payments: { data: [{ amount: 600000 }, { amount: 351000 }] },
  expenses: { data: [{ amount: 1000 }] },
};
const BOOKINGS_DATA = [{ total_amount: 100000, amount_paid: 40000 }, { total_amount: 50000, amount_paid: 50000 }];

const okResponse = (body: unknown = { ok: true, status: "stored", schema: "v1", warnings: [] }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const noSleep = async () => {};
const deps = (over: Record<string, unknown> = {}) => ({
  admin: fakeAdmin(GOOD, BOOKINGS_DATA).client,
  now: () => NOW,
  runId: () => RUN,
  sleep: noSleep,
  ...over,
});

describe("pushControlCenterMetrics", () => {
  beforeEach(() => {
    process.env.CONTROL_CENTER_URL = "https://cc.example.com/";
    process.env.METRICS_PUSH_SECRET = SECRET;
  });
  afterEach(() => vi.restoreAllMocks());

  describe("envoi nominal", () => {
    it("envoie un contrat v1 complet, calculé depuis la source", async () => {
      const fetchImpl = vi.fn(async () => okResponse());
      const { payload, attempts } = await pushControlCenterMetrics(deps({ fetchImpl }) as never);

      expect(attempts).toBe(1);
      expect(payload).toMatchObject({
        contract_version: 1, projet: "sejoura", nom: "Séjoura", run_id: RUN,
        collected_at: "2026-10-19T01:00:00.123Z",
        mrr: 125000, comptes_actifs: 17, statut_sante: "healthy",
      });
      expect(payload.details).toMatchObject({
        utilisateurs_actifs: 29, abonnements_actifs: 2, etablissements_actifs: 18,
        reservations_actives: 10, voyageurs: 46, revenus_collectes: 951000, impayes_actifs: 60000, depenses_mois: 1000,
      });
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://cc.example.com/api/metrics/push"); // pas de double slash
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
      expect(init.body as string).not.toContain(SECRET); // le secret ne voyage jamais dans le corps
    });

    it("n'envoie que des entiers pour mrr (contrat v1)", () => {
      const p = buildPayload(
        { tenantCount: 1, activeUserCount: 0, activeSubscriptionCount: 1, accommodationCount: 0, activeBookingCount: 0, clientCount: 0, mrr: 100.6, revenusCollectes: 0, impayesActifs: 0, depensesMois: 0 },
        { collectedAt: NOW, runId: RUN, environment: "production" }
      );
      expect(Number.isInteger(p.mrr)).toBe(true);
      expect(p.mrr).toBe(101);
    });

    it("signale un hôtel inexistant en « warning » plutôt qu'en « healthy »", async () => {
      const admin = fakeAdmin({ ...GOOD, tenants: { count: 0 } }, []).client;
      const { payload } = await pushControlCenterMetrics(deps({ admin, fetchImpl: vi.fn(async () => okResponse()) }) as never);
      expect(payload.statut_sante).toBe("warning");
    });

    it("transmet le statut de réception du Control Center (ex. doublon)", async () => {
      const fetchImpl = vi.fn(async () => okResponse({ ok: true, status: "duplicate", schema: "legacy", warnings: ["schema_outdated"] }));
      const { result } = await pushControlCenterMetrics(deps({ fetchImpl }) as never);
      expect(result).toMatchObject({ status: "duplicate", schema: "legacy" });
    });
  });

  describe("étape « config » : visible tout de suite, sans lire la base", () => {
    it.each([
      [{ CONTROL_CENTER_URL: undefined }, ["CONTROL_CENTER_URL"]],
      [{ METRICS_PUSH_SECRET: undefined }, ["METRICS_PUSH_SECRET"]],
      [{ CONTROL_CENTER_URL: " ", METRICS_PUSH_SECRET: "" }, ["CONTROL_CENTER_URL", "METRICS_PUSH_SECRET"]],
    ])("variables manquantes %j", async (env, missing) => {
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      const admin = fakeAdmin(GOOD, BOOKINGS_DATA);
      const fetchImpl = vi.fn();
      const err = await pushControlCenterMetrics(deps({ admin: admin.client, fetchImpl }) as never).catch((e) => e);

      expect(err).toBeInstanceOf(ControlCenterPushError);
      expect(err).toMatchObject({ stage: "config", code: "configuration_missing", missing });
      expect(admin.calls).toEqual([]); // AUCUNE requête en base
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(describePushFailure(err).status).toBe(503);
    });

    it("refuse une URL invalide ou non sécurisée, sans l'afficher", () => {
      process.env.CONTROL_CENTER_URL = "pas une url";
      expect(() => readControlCenterConfig()).toThrow(/n'est pas une URL valide/);
      process.env.CONTROL_CENTER_URL = "http://cc.example.com";
      expect(() => readControlCenterConfig()).toThrow(/https/);
      process.env.CONTROL_CENTER_URL = "http://localhost:3000";
      expect(readControlCenterConfig().baseUrl).toBe("http://localhost:3000");
    });
  });

  describe("étape « collect » : la source est illisible", () => {
    it("nomme la table et le code, n'envoie rien", async () => {
      const admin = fakeAdmin({ ...GOOD, payments: { error: { code: "42P01", message: "relation \"x\" does not exist" } } }, BOOKINGS_DATA).client;
      const fetchImpl = vi.fn();
      const err = (await pushControlCenterMetrics(deps({ admin, fetchImpl }) as never).catch((e) => e)) as ControlCenterPushError;

      expect(err).toMatchObject({ stage: "collect", code: "source_unavailable" });
      expect(err.message).toContain("payments");
      expect(err.message).toContain("42P01");
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(describePushFailure(err).status).toBe(500);
    });
  });

  describe("étape « rejected » : le Control Center refuse", () => {
    it("401 : ne relance PAS, expose le statut amont", async () => {
      const fetchImpl = vi.fn(async () => okResponse({ ok: false, code: "unauthorized" }, 401));
      const err = (await pushControlCenterMetrics(deps({ fetchImpl }) as never).catch((e) => e)) as ControlCenterPushError;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(err).toMatchObject({ stage: "rejected", upstreamStatus: 401, upstreamCode: "unauthorized" });
      const d = describePushFailure(err);
      expect(d.status).toBe(502);
      expect(d.body).toMatchObject({ stage: "rejected", upstream_status: 401, upstream_code: "unauthorized" });
    });

    it("400 : remonte les champs fautifs (issues) sans relancer", async () => {
      const fetchImpl = vi.fn(async () => okResponse({ ok: false, code: "invalid_payload", issues: [{ path: "mrr", message: "Invalid input" }] }, 400));
      const err = (await pushControlCenterMetrics(deps({ fetchImpl }) as never).catch((e) => e)) as ControlCenterPushError;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(err.issues).toEqual([{ path: "mrr", message: "Invalid input" }]);
    });

    it("422 environment_not_accepted : pas de relance", async () => {
      const fetchImpl = vi.fn(async () => okResponse({ ok: false, code: "environment_not_accepted" }, 422));
      await expect(pushControlCenterMetrics(deps({ fetchImpl }) as never)).rejects.toMatchObject({ upstreamCode: "environment_not_accepted" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe("relance : seulement sur panne transitoire, avec le MÊME envoi", () => {
    it("500 puis 200 : 2 tentatives, corps strictement identique (même run_id)", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(okResponse({ ok: false, code: "history_failed", metric_stored: true }, 500))
        .mockResolvedValueOnce(okResponse());
      const sleep = vi.fn(noSleep);
      const { attempts } = await pushControlCenterMetrics(deps({ fetchImpl, sleep }) as never);

      expect(attempts).toBe(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      const bodies = fetchImpl.mock.calls.map((c) => (c[1] as RequestInit).body);
      expect(bodies[0]).toBe(bodies[1]);
      expect(JSON.parse(bodies[0] as string).run_id).toBe(RUN);
    });

    it("500 deux fois : échoue (rejected), 2 tentatives seulement", async () => {
      const fetchImpl = vi.fn(async () => okResponse({ ok: false, code: "storage_failed" }, 500));
      const err = (await pushControlCenterMetrics(deps({ fetchImpl }) as never).catch((e) => e)) as ControlCenterPushError;
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(err).toMatchObject({ stage: "rejected", upstreamStatus: 500, upstreamCode: "storage_failed", attempts: 2 });
    });

    it("429 est relancé", async () => {
      const fetchImpl = vi.fn().mockResolvedValueOnce(okResponse({}, 429)).mockResolvedValueOnce(okResponse());
      const { attempts } = await pushControlCenterMetrics(deps({ fetchImpl }) as never);
      expect(attempts).toBe(2);
    });
  });

  describe("étape « send » : le réseau", () => {
    it("injoignable : 2 tentatives puis network_error (502)", async () => {
      const fetchImpl = vi.fn(async () => { throw new TypeError("fetch failed"); });
      const err = (await pushControlCenterMetrics(deps({ fetchImpl }) as never).catch((e) => e)) as ControlCenterPushError;
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(err).toMatchObject({ stage: "send", code: "network_error", attempts: 2 });
      expect(describePushFailure(err).status).toBe(502);
    });

    it("délai dépassé : code timeout (504)", async () => {
      const fetchImpl = vi.fn(async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); });
      const err = (await pushControlCenterMetrics(deps({ fetchImpl }) as never).catch((e) => e)) as ControlCenterPushError;
      expect(err.code).toBe("timeout");
      expect(describePushFailure(err).status).toBe(504);
    });
  });

  it("aucune erreur, aucune réponse décrite ne contient le secret", async () => {
    const cases: Array<() => Promise<unknown>> = [
      () => pushControlCenterMetrics(deps({ fetchImpl: vi.fn(async () => okResponse({ ok: false, code: "unauthorized", echo: SECRET }, 401)) }) as never),
      () => pushControlCenterMetrics(deps({ fetchImpl: vi.fn(async () => { throw new TypeError(`fetch failed ${SECRET}`); }) }) as never),
    ];
    for (const run of cases) {
      const err = await run().catch((e) => e);
      expect(JSON.stringify(describePushFailure(err))).not.toContain(SECRET);
      expect(String((err as Error).message)).not.toContain(SECRET);
    }
  });

  it("une erreur inattendue devient internal_error, sans détail", () => {
    const d = describePushFailure(new Error(`boom ${SECRET}`));
    expect(d.status).toBe(500);
    expect(JSON.stringify(d.body)).not.toContain(SECRET);
  });
});

describe("createAdminClient n'est appelé qu'après la configuration", () => {
  it("n'est jamais créé quand la configuration manque", async () => {
    delete process.env.CONTROL_CENTER_URL;
    process.env.METRICS_PUSH_SECRET = SECRET;
    vi.mocked(createAdminClient).mockClear();
    await pushControlCenterMetrics({ now: () => NOW, sleep: noSleep }).catch(() => {});
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
