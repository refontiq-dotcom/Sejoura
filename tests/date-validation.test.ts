import { describe, expect, it } from "vitest";
import { canAccommodateGuests, isValidDateOnly, parseGuestCount } from "../src/lib/trouvetou/validation";

describe("isValidDateOnly", () => {
  it("accepts valid dates and leap days", () => {
    expect(isValidDateOnly("2026-11-10")).toBe(true);
    expect(isValidDateOnly("2024-02-29")).toBe(true);
  });

  it("rejects impossible calendar dates", () => {
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2026-02-31")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
  });

  it("rejects non-date formats and non-string values", () => {
    expect(isValidDateOnly("10/11/2026")).toBe(false);
    expect(isValidDateOnly("")).toBe(false);
    expect(isValidDateOnly(null)).toBe(false);
  });
});

describe("external booking guest validation", () => {
  it("defaults to one guest and accepts bounded integer counts", () => {
    expect(parseGuestCount(undefined)).toBe(1);
    expect(parseGuestCount("2")).toBe(2);
    expect(parseGuestCount(50)).toBe(50);
  });

  it("rejects invalid guest counts", () => {
    expect(parseGuestCount(0)).toBeNull();
    expect(parseGuestCount(51)).toBeNull();
    expect(parseGuestCount(1.5)).toBeNull();
    expect(parseGuestCount("two")).toBeNull();
  });

  it("enforces room type capacity", () => {
    expect(canAccommodateGuests(2, 2)).toBe(true);
    expect(canAccommodateGuests(3, 2)).toBe(false);
    expect(canAccommodateGuests(1, 0)).toBe(false);
  });
});
