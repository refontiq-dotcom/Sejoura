import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getRequestId: () => "req-test",
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
// Les autres tâches de daily-tasks ne sont pas l'objet de ces tests.
vi.mock("@/lib/trouvetou/sync", () => ({ syncListingsToTrouvetou: vi.fn(async () => ({ ok: true })) }));

import { createAdminClient } from "@/lib/supabase/admin";
import { GET as cron } from "@/app/api/cron/control-center-metrics/route";
import { POST as manual } from "@/app/api/metrics/push/route";

const CRON = "cron-secret-test";
const PUSH = "push-secret-test";

function chainFor(table: string) {
  let head = false, cols = "";
  const c: Record<string, unknown> = {};
  for (const m of ["eq", "neq", "in", "gte"]) c[m] = () => c;
  c.select = (s: string, o?: { head?: boolean }) => ((cols = s), (head = Boolean(o?.head)), c);
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(head ? { count: table === "tenants" ? 3 : 1, error: null } : { data: cols.includes("monthly_price") ? [{ monthly_price: 5000 }] : [], error: null }).then(res, rej);
  return c;
}

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", headers });
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe("routes d'envoi des métriques de Séjoura", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON;
    process.env.METRICS_PUSH_SECRET = PUSH;
    process.env.CONTROL_CENTER_URL = "https://cc.example.com";
    vi.mocked(createAdminClient).mockReturnValue({ from: chainFor } as never);
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("authentification", () => {
    it("cron : 401 sans secret, avec un mauvais secret, ou si CRON_SECRET n'est pas défini", async () => {
      expect((await cron(req())).status).toBe(401);
      expect((await cron(req({ authorization: "Bearer faux" }))).status).toBe(401);
      expect((await cron(req({ authorization: CRON }))).status).toBe(401); // pas de schéma Bearer
      delete process.env.CRON_SECRET;
      expect((await cron(req({ authorization: "Bearer " }))).status).toBe(401);
      expect((await cron(req({ authorization: "Bearer undefined" }))).status).toBe(401);
    });
    it("déclencheur manuel : 401 avec le secret du cron (les deux secrets sont distincts)", async () => {
      expect((await manual(req({ authorization: `Bearer ${CRON}` }))).status).toBe(401);
    });
  });

  describe("l'erreur dit ce qui ne va pas (fin du « 500 » générique)", () => {
    it("variable manquante → 503, étape config, noms des variables", async () => {
      delete process.env.CONTROL_CENTER_URL;
      const res = await cron(req({ authorization: `Bearer ${CRON}` }));
      const body = await json(res);
      expect(res.status).toBe(503);
      expect(body).toMatchObject({ ok: false, stage: "config", code: "configuration_missing", missing: ["CONTROL_CENTER_URL"] });
    });

    it("secret refusé par le Control Center → 502, étape rejected, statut amont 401", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "unauthorized" }), { status: 401 })));
      const res = await cron(req({ authorization: `Bearer ${CRON}` }));
      expect(res.status).toBe(502);
      expect(await json(res)).toMatchObject({ stage: "rejected", upstream_status: 401, upstream_code: "unauthorized" });
    });

    it("panne côté Control Center → 502 après 2 tentatives, avec le code amont", async () => {
      const f = vi.fn(async () => new Response(JSON.stringify({ code: "history_failed" }), { status: 500 }));
      vi.stubGlobal("fetch", f);
      vi.useFakeTimers();
      const pending = cron(req({ authorization: `Bearer ${CRON}` }));
      await vi.advanceTimersByTimeAsync(1500);
      const res = await pending;
      vi.useRealTimers();
      expect(f).toHaveBeenCalledTimes(2);
      expect(await json(res)).toMatchObject({ stage: "rejected", upstream_code: "history_failed", attempts: 2 });
    });

    it("jamais le secret dans une réponse d'erreur", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError(`boom ${PUSH}`); }));
      vi.useFakeTimers();
      const pending = manual(req({ authorization: `Bearer ${PUSH}` }));
      await vi.advanceTimersByTimeAsync(1500);
      const res = await pending;
      vi.useRealTimers();
      expect(JSON.stringify(await json(res))).not.toContain(PUSH);
    });
  });

  describe("succès", () => {
    it("renvoie run_id, date de collecte et statut de réception du Control Center", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, status: "stored", schema: "v1", warnings: [] }), { status: 200 })));
      const res = await cron(req({ authorization: `Bearer ${CRON}` }));
      const body = await json(res);
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ ok: true, attempts: 1, control_center: { status: "stored", schema: "v1" } });
      expect(body.run_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(new Date(String(body.collected_at)).toString()).not.toBe("Invalid Date");
    });
  });
});
