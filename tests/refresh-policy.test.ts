import { describe, expect, it } from "vitest";
import { REALTIME_DEBOUNCE_MS, shouldRunBackgroundRefresh } from "../src/lib/refresh-policy";

describe("refresh-policy", () => {
  it("ne poll pas quand l'onglet est caché", () => {
    expect(shouldRunBackgroundRefresh("hidden")).toBe(false);
    expect(shouldRunBackgroundRefresh("visible")).toBe(true);
  });

  it("debounce realtime autour de 400ms", () => {
    expect(REALTIME_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(REALTIME_DEBOUNCE_MS).toBeLessThanOrEqual(500);
  });
});
