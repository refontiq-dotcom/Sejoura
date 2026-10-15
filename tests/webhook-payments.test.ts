import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

// ──────────────────────────────────────────────────────────────────────────────
// SÉCURITÉ — /api/v1/webhooks/payments : aucun cas ci-dessous ne doit pouvoir
// confirmer un paiement injustifié. Mock Supabase isolé (aucun réseau, aucune
// écriture en base réelle), secrets posés via vi.stubEnv.
// ──────────────────────────────────────────────────────────────────────────────

type TxState = { id: string; booking_id: string; status: string; amount: number };

type MockState = {
  tx: TxState | null;
  booking: { id: string; tenant_id: string; status: string } | null;
  owner: { id: string } | null;
  insertedPayments: Array<Record<string, unknown>>;
};

type CallLog = {
  txUpdates: Array<Record<string, unknown>>;
  bookingUpdates: Array<Record<string, unknown>>;
};

function matches(
  row: Record<string, unknown> | null,
  filters: Record<string, unknown>
): boolean {
  if (!row) return false;
  // Mock tolérant : les clés filtrées absentes du fixture (colonnes non
  // modélisées ici, ex. provider_transaction_id sur un lookup) sont
  // ignorées ; les clés présentes doivent correspondre exactement.
  return Object.entries(filters).every(([k, v]) => !(k in row) || row[k] === v);
}

function createAdminMock(state: MockState, log: CallLog) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let updatePayload: Record<string, unknown> | null = null;
      let insertPayload: Record<string, unknown> | null = null;
      let wantsRows = false;
      let singleMode: "none" | "single" | "maybe" = "none";

      function settle(): { data: unknown; error: unknown } {
        if (insertPayload) {
          state.insertedPayments.push(insertPayload);
          return { data: null, error: null };
        }
        if (updatePayload) {
          if (table === "online_payment_transactions" && state.tx) {
            log.txUpdates.push({ ...updatePayload, ...filters });
            if (matches(state.tx, filters)) {
              Object.assign(state.tx, updatePayload);
              return { data: wantsRows ? [{ id: state.tx.id }] : null, error: null };
            }
            return { data: [], error: null };
          }
          if (table === "bookings" && state.booking) {
            log.bookingUpdates.push({ ...updatePayload, ...filters });
            if (matches(state.booking, filters)) {
              Object.assign(state.booking, updatePayload);
              return {
                data: wantsRows
                  ? [{ id: state.booking.id, tenant_id: state.booking.tenant_id }]
                  : null,
                error: null,
              };
            }
            return {
              data: null,
              error: singleMode === "single" ? { message: "0 rows" } : null,
            };
          }
          return { data: wantsRows ? [] : null, error: null };
        }
        if (table === "online_payment_transactions") {
          if (state.tx && matches(state.tx, filters)) {
            const { id, booking_id, status, amount } = state.tx;
            return { data: { id, booking_id, status, amount }, error: null };
          }
          return { data: null, error: null };
        }
        if (table === "users") {
          return { data: state.owner, error: null };
        }
        return { data: null, error: null };
      }

      const builder = {
        select(_cols: string) {
          wantsRows = true;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        limit(_n: number) {
          return builder;
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          insertPayload = payload;
          return builder;
        },
        single() {
          singleMode = "single";
          return Promise.resolve(settle());
        },
        maybeSingle() {
          singleMode = "maybe";
          return Promise.resolve(settle());
        },
        then(
          resolve: (v: { data: unknown; error: unknown }) => unknown,
          reject?: (e: unknown) => unknown
        ) {
          return Promise.resolve(settle()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}


vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (globalThis as Record<string, unknown>).__mockAdmin,
}));

import { POST as webhookPost } from "@/app/api/v1/webhooks/payments/route";
import { OrangeMoneyPaymentService } from "@/lib/payments/orange-money";
import { MtnPaymentService } from "@/lib/payments/mtn";
import { MoovAfricaPaymentService } from "@/lib/payments/moov-africa";
import { PiSpiPaymentService } from "@/lib/payments/pi-spi";
import { WavePaymentService } from "@/lib/payments/wave";

const TEST_SECRET = "test-webhook-secret-value";

function makeState(overrides?: Partial<MockState>): { state: MockState; log: CallLog } {
  const state: MockState = {
    tx: { id: "tx1", booking_id: "b1", status: "pending", amount: 15000 },
    booking: { id: "b1", tenant_id: "t1", status: "pending_payment" },
    owner: { id: "u1" },
    insertedPayments: [],
    ...overrides,
  };
  const log: CallLog = { txUpdates: [], bookingUpdates: [] };
  (globalThis as Record<string, unknown>).__mockAdmin = createAdminMock(state, log);
  return { state, log };
}

function makeRequest(
  body: unknown,
  opts: { provider?: string; headers?: Record<string, string> } = {}
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.provider) headers["x-payment-provider"] = opts.provider;
  return new Request("https://example.test/api/v1/webhooks/payments", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function signWave(body: unknown): string {
  const payload = JSON.stringify(body);
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", TEST_SECRET).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

beforeEach(() => {
  vi.stubEnv("WEBHOOK_SECRET", TEST_SECRET);
  vi.stubEnv("WAVE_WEBHOOK_SECRET", TEST_SECRET);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).__mockAdmin;
});

// ── D. Adapteurs : refus fermé tant que le contrat n'est pas vérifié ─────────

describe("validateurs de signature des adaptateurs — refus fermé", () => {
  const payload = { status: "SUCCESS", amount: 15000 };

  it("Orange Money refuse toujours", () => {
    const svc = new OrangeMoneyPaymentService({
      client_id: "id",
      client_secret: "secret",
      merchant_number: "m",
    });
    expect(svc.validateWebhookSignature(payload, "any")).toBe(false);
  });

  it("MTN refuse toujours", () => {
    const svc = new MtnPaymentService({ subscription_key: "k", api_user: "u", api_key: "a" });
    expect(svc.validateWebhookSignature(payload, "any")).toBe(false);
  });

  it("Moov Africa refuse toujours", () => {
    const svc = new MoovAfricaPaymentService({ api_key: "k", merchant_code: "m" });
    expect(svc.validateWebhookSignature(payload, "any")).toBe(false);
  });

  it("PI-SPI refuse toujours", () => {
    const svc = new PiSpiPaymentService({
      merchant_id: "m",
      secret_key: "s",
      bank_code: "BNI-CI",
    });
    expect(svc.validateWebhookSignature(payload, "any")).toBe(false);
  });

  it("Wave (stub non connecté) refuse toujours", () => {
    const svc = new WavePaymentService({ api_key: "k", merchant_id: "m" });
    expect(svc.validateWebhookSignature(payload, "any")).toBe(false);
  });
});

describe("fournisseurs non configurés — aucun paiement déclaré vérifié", () => {
  const baseParams = {
    amount: 15000,
    reference: "RES-TEST",
    description: "test",
    returnUrl: "https://example.test/ok",
    cancelUrl: "https://example.test/ko",
    webhookUrl: "https://example.test/hook",
  };

  it("Wave sans clé mock_ renvoie WAVE_NOT_CONFIGURED (success=false)", async () => {
    const svc = new WavePaymentService({ api_key: "real_non_mock_key", merchant_id: "m" });
    const res = await svc.initiatePayment(baseParams);
    expect(res.success).toBe(false);
    expect(res.error).toContain("WAVE_NOT_CONFIGURED");
  });

  it("Orange Money renvoie OM_NOT_CONFIGURED (success=false)", async () => {
    const svc = new OrangeMoneyPaymentService({
      client_id: "id",
      client_secret: "secret",
      merchant_number: "m",
    });
    const res = await svc.initiatePayment(baseParams);
    expect(res.success).toBe(false);
    expect(res.error).toContain("OM_NOT_CONFIGURED");
  });

  it("MTN renvoie MTN_NOT_CONFIGURED (success=false)", async () => {
    const svc = new MtnPaymentService({ subscription_key: "k", api_user: "u", api_key: "a" });
    const res = await svc.initiatePayment({ ...baseParams, customerPhone: "+2250102030405" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("MTN_NOT_CONFIGURED");
  });

  it("Moov Africa renvoie MOOV_NOT_CONFIGURED (success=false)", async () => {
    const svc = new MoovAfricaPaymentService({ api_key: "k", merchant_code: "m" });
    const res = await svc.initiatePayment({ ...baseParams, customerPhone: "+2250102030405" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("MOOV_NOT_CONFIGURED");
  });

  it("PI-SPI renvoie PISPI_NOT_CONFIGURED (success=false)", async () => {
    const svc = new PiSpiPaymentService({ merchant_id: "m", secret_key: "s", bank_code: "BNI-CI" });
    const res = await svc.initiatePayment(baseParams);
    expect(res.success).toBe(false);
    expect(res.error).toContain("PISPI_NOT_CONFIGURED");
  });
});


// ── C. Échec fournisseur et idempotence ──────────────────────────────────────

describe("échecs et idempotence", () => {
  const auth = { "x-webhook-secret": TEST_SECRET };

  it("un échec fournisseur marque la transaction en échec SANS confirmer la réservation", async () => {
    const { state, log } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "failed" },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(200);
    expect(state.tx?.status).toBe("failed");
    expect(log.bookingUpdates.length).toBe(0);
    expect(state.booking?.status).toBe("pending_payment");
    expect(state.insertedPayments.length).toBe(0);
  });

  it("une transaction déjà traitée répond « Déjà traité » sans nouvel effet", async () => {
    const { state, log } = makeState({
      tx: { id: "tx1", booking_id: "b1", status: "successful", amount: 15000 },
    });
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful", amount: 15000 },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(200);
    expect(log.txUpdates.length).toBe(0);
    expect(log.bookingUpdates.length).toBe(0);
    expect(state.insertedPayments.length).toBe(0);
  });

  it("le webhook répété après confirmation ne confirme pas deux fois", async () => {
    const { state, log } = makeState();
    const body = { transaction_id: "TR1", provider_status: "successful", amount: 15000 };
    const first = await webhookPost(makeRequest(body, { provider: "orange_money", headers: auth }));
    expect(first.status).toBe(200);
    expect(state.tx?.status).toBe("successful");
    expect(state.insertedPayments.length).toBe(1);
    const firstBookingUpdates = log.bookingUpdates.length;

    // Rejeu identique : la transaction n'est plus "pending".
    const second = await webhookPost(makeRequest(body, { provider: "orange_money", headers: auth }));
    expect(second.status).toBe(200);
    expect(log.bookingUpdates.length).toBe(firstBookingUpdates);
    expect(state.insertedPayments.length).toBe(1); // pas de second encaissement
    expect(state.booking?.status).toBe("confirmed"); // état stable, non re-confirmé
  });

  it("un succès confirme exactement une fois (transition pending → successful)", async () => {
    const { state, log } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "SUCCESSFUL", amount: 15000 },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(200);
    expect(state.tx?.status).toBe("successful");
    expect(log.txUpdates.length).toBe(1);
    expect(state.booking?.status).toBe("confirmed");
    expect(state.insertedPayments.length).toBe(1);
    expect(state.insertedPayments[0].amount).toBe(15000); // montant serveur, jamais reçu
  });
});


// ── B. Cohérence transaction / fournisseur / montant / devise ────────────────

describe("cohérence transaction / fournisseur / montant / devise", () => {
  const auth = { "x-webhook-secret": TEST_SECRET };

  it("400 pour un fournisseur hors whitelist", async () => {
    const { log } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful" },
        { provider: "unknown_provider", headers: auth }
      )
    );
    expect(res.status).toBe(400);
    expect(log.txUpdates.length).toBe(0);
  });

  it("404 pour une transaction inexistante", async () => {
    makeState({ tx: null });
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "NOPE", provider_status: "successful" },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(404);
  });

  it("400 si le montant fourni ne correspond pas au montant attendu", async () => {
    const { state, log } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful", amount: 1 },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(400);
    expect(log.txUpdates.length).toBe(0);
    expect(state.tx?.status).toBe("pending");
    expect(state.insertedPayments.length).toBe(0);
  });

  it("400 si le montant fourni n'est pas un entier valide", async () => {
    const { state } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful", amount: "15000abc" },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(400);
    expect(state.tx?.status).toBe("pending");
  });

  it("400 si la devise fournie n'est pas XOF", async () => {
    const { state, log } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful", currency: "USD" },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(400);
    expect(log.txUpdates.length).toBe(0);
    expect(state.tx?.status).toBe("pending");
  });

  it("accepte la devise XOF explicite", async () => {
    const { state } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful", amount: 15000, currency: "XOF" },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(200);
    expect(state.tx?.status).toBe("successful");
  });

  it("400 si le statut est absent (aucun basculement)", async () => {
    const { log } = makeState();
    const res = await webhookPost(
      makeRequest({ transaction_id: "TR1" }, { provider: "orange_money", headers: auth })
    );
    expect(res.status).toBe(400);
    expect(log.txUpdates.length).toBe(0);
  });

  it("400 si le statut fourni n'est pas reconnu (aucune devinette)", async () => {
    const { state, log } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "processing" },
        { provider: "orange_money", headers: auth }
      )
    );
    expect(res.status).toBe(400);
    expect(state.tx?.status).toBe("pending");
    expect(log.txUpdates.length).toBe(0);
  });
});


// ── A. Authentification ───────────────────────────────────────────────────────

describe("authentification du webhook", () => {
  it("rejette sans secret (WEBHOOK_SECRET absent)", async () => {
    makeState();
    vi.stubEnv("WEBHOOK_SECRET", "");
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful" },
        { provider: "orange_money" }
      )
    );
    expect(res.status).toBe(401);
  });

  it("rejette un secret fourni incorrect (401, aucun effet)", async () => {
    const { state, log } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful", amount: 15000 },
        { provider: "orange_money", headers: { "x-webhook-secret": "wrong" } }
      )
    );
    expect(res.status).toBe(401);
    expect(log.txUpdates.length).toBe(0);
    expect(state.tx?.status).toBe("pending");
    expect(state.booking?.status).toBe("pending_payment");
  });

  it("rejette une signature Wave absente (401)", async () => {
    makeState();
    const res = await webhookPost(
      makeRequest({ transaction_id: "TR1", provider_status: "successful" }, { provider: "wave" })
    );
    expect(res.status).toBe(401);
  });

  it("rejette une signature Wave invalide (401, aucun effet)", async () => {
    const { state, log } = makeState();
    const res = await webhookPost(
      makeRequest(
        { transaction_id: "TR1", provider_status: "successful", amount: 15000 },
        { provider: "wave", headers: { "wave-signature": "t=1,v1=deadbeef" } }
      )
    );
    expect(res.status).toBe(401);
    expect(log.txUpdates.length).toBe(0);
    expect(state.tx?.status).toBe("pending");
  });

  it("accepte une signature Wave valide (HMAC vérifié côté serveur)", async () => {
    const { state } = makeState();
    const body = { transaction_id: "TR1", provider_status: "successful", amount: 15000 };
    const res = await webhookPost(
      makeRequest(body, { provider: "wave", headers: { "wave-signature": signWave(body) } })
    );
    expect(res.status).toBe(200);
    expect(state.tx?.status).toBe("successful");
  });
});


