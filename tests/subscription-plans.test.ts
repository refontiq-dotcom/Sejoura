import { describe, it, expect } from "vitest";
import { normalizePlan, canAccessFeature, getPlanPrice } from "../src/lib/subscription-plans";

describe("subscription-plans", () => {
  it("normalise les noms de plans", () => {
    expect(normalizePlan("ESSENTIEL")).toBe("essentiel");
    expect(normalizePlan("ENTREPRISE")).toBe("entreprise");
    expect(normalizePlan("ENTERPRISE")).toBe("entreprise");
    expect(normalizePlan("standard")).toBe("essentiel");
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan(null)).toBe("free");
  });

  it("fixe les prix des offres payantes", () => {
    expect(getPlanPrice("essentiel")).toBe(15000);
    expect(getPlanPrice("entreprise")).toBe(55000);
    expect(getPlanPrice("free")).toBe(0);
  });

  it("réserve l'API externe et le boost Trouvetou à l'Entreprise", () => {
    expect(canAccessFeature("externalApi", "essentiel")).toBe(false);
    expect(canAccessFeature("externalApi", "entreprise")).toBe(true);
    expect(canAccessFeature("trouvetouBoost", "essentiel")).toBe(false);
    expect(canAccessFeature("trouvetouBoost", "entreprise")).toBe(true);
  });
});
