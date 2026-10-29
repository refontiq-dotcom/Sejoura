import { afterEach, describe, expect, it } from "vitest";
import { isTrouvetouBookingRequest } from "../src/lib/trouvetou/booking-auth";

const originalSecret = process.env.TROUVETOU_BOOKING_SHARED_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.TROUVETOU_BOOKING_SHARED_SECRET;
  } else {
    process.env.TROUVETOU_BOOKING_SHARED_SECRET = originalSecret;
  }
});

describe("authentification serveur Trouvetou → Séjoura", () => {
  it("accepte uniquement le secret d'intégration dans son en-tête dédié", () => {
    process.env.TROUVETOU_BOOKING_SHARED_SECRET = "test-shared-secret";

    expect(
      isTrouvetouBookingRequest(
        new Headers({ "x-trouvetou-booking-secret": "test-shared-secret" })
      )
    ).toBe(true);
    expect(
      isTrouvetouBookingRequest(
        new Headers({ "x-api-key": "test-shared-secret" })
      )
    ).toBe(false);
    expect(
      isTrouvetouBookingRequest(
        new Headers({ "x-trouvetou-booking-secret": "wrong-secret" })
      )
    ).toBe(false);
  });

  it("refuse les requêtes si le secret serveur n'est pas configuré", () => {
    delete process.env.TROUVETOU_BOOKING_SHARED_SECRET;

    expect(
      isTrouvetouBookingRequest(
        new Headers({ "x-trouvetou-booking-secret": "anything" })
      )
    ).toBe(false);
  });
});
