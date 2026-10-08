import { describe, it, expect } from "vitest";
import { isDoubleBookingError } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Classification des erreurs de `create_booking` vers le contrat 409
// DOUBLE_BOOKING de POST /api/v1/external/bookings.
// ──────────────────────────────────────────────────────────────────────────────

describe("isDoubleBookingError", () => {
  it("reconnaît le RAISE P0001 de check_double_booking", () => {
    // Arrange
    const error = {
      code: "P0001",
      message: "DOUBLE_BOOKING: Cette chambre est déjà réservée pour ces dates",
    };

    // Act
    const result = isDoubleBookingError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("reconnaît la contrainte EXCLUDE no_double_booking (SQLSTATE 23P01 sous concurrence)", () => {
    // Arrange
    const error = {
      code: "23P01",
      message: 'conflicts with exclusion constraint "no_double_booking"',
      details:
        "Key (room_id, daterange(check_in_date, check_out_date, '[)'::text), ...) conflicts with existing key.",
    };

    // Act
    const result = isDoubleBookingError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("reconnaît le nom de contrainte même si le code SQLSTATE est absent", () => {
    // Arrange
    const error = {
      message: 'conflicts with exclusion constraint "no_double_booking"',
    };

    // Act
    const result = isDoubleBookingError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("est insensible à la casse du motif (message en minuscules)", () => {
    // Arrange
    const error = { message: "double_booking: conflit de dates" };

    // Act
    const result = isDoubleBookingError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("retombe sur false pour une erreur PostgreSQL sans rapport", () => {
    // Arrange
    const error = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "bookings_booking_code_key"',
    };

    // Act
    const result = isDoubleBookingError(error);

    // Assert
    expect(result).toBe(false);
  });

  it("retombe sur false quand le message est absent", () => {
    // Arrange
    const error = { code: "XX000" };

    // Act
    const result = isDoubleBookingError(error);

    // Assert
    expect(result).toBe(false);
  });

  it("retombe sur false pour les valeurs non-objet", () => {
    // Act / Assert
    expect(isDoubleBookingError(null)).toBe(false);
    expect(isDoubleBookingError(undefined)).toBe(false);
    expect(isDoubleBookingError("DOUBLE_BOOKING")).toBe(false);
    expect(isDoubleBookingError(42)).toBe(false);
  });
});
