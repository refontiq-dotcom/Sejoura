import { describe, expect, it } from "vitest";
import { isValidDateOnly } from "../src/lib/trouvetou/validation";

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
