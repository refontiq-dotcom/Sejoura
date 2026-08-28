import { describe, it, expect } from "vitest";
import {
  normalizePlan,
  canAccessFeature,
  getPlanPrice,
  getPlanAnnualPrice,
  getWavePayLink,
  getClientPortalMode,
  getPlanLimits,
} from "../src/lib/subscription-plans";

describe("subscription-plans", () => {
  it("normalise les noms de plans", () => {
    expect(normalizePlan("ESSENTIEL")).toBe("essentiel");
    expect(normalizePlan("CROISSANCE")).toBe("croissance");
    expect(normalizePlan("GROWTH")).toBe("croissance");
    expect(normalizePlan("ENTREPRISE")).toBe("entreprise");
    expect(normalizePlan("ENTERPRISE")).toBe("entreprise");
    expect(normalizePlan("standard")).toBe("essentiel");
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan(null)).toBe("free");
  });

  it("fixe les prix des offres payantes", () => {
    expect(getPlanPrice("essentiel")).toBe(9900);
    expect(getPlanPrice("croissance")).toBe(24900);
    expect(getPlanPrice("entreprise")).toBe(54900);
    expect(getPlanPrice("free")).toBe(0);
  });

  it("calcule le prix annuel avec 2 mois offerts (10 mois facturés)", () => {
    expect(getPlanAnnualPrice("essentiel")).toBe(99000);
    expect(getPlanAnnualPrice("croissance")).toBe(249000);
    expect(getPlanAnnualPrice("entreprise")).toBe(549000);
    expect(getPlanAnnualPrice("free")).toBe(0);
  });

  it("réserve l'API externe, les rôles sur mesure et les stats avancées à l'Entreprise", () => {
    expect(canAccessFeature("externalApi", "essentiel")).toBe(false);
    expect(canAccessFeature("externalApi", "croissance")).toBe(false);
    expect(canAccessFeature("externalApi", "entreprise")).toBe(true);
    expect(canAccessFeature("advancedStats", "croissance")).toBe(false);
    expect(canAccessFeature("advancedStats", "entreprise")).toBe(true);
    expect(canAccessFeature("multiResidences", "croissance")).toBe(false);
    expect(canAccessFeature("multiResidences", "entreprise")).toBe(true);
  });

  it("débloque le module ménage dès la Croissance ; le boost permanent reste Entreprise", () => {
    expect(canAccessFeature("cleaningModule", "essentiel")).toBe(false);
    expect(canAccessFeature("cleaningModule", "croissance")).toBe(true);
    expect(canAccessFeature("cleaningModule", "entreprise")).toBe(true);
    expect(canAccessFeature("trouvetouBoost", "essentiel")).toBe(false);
    expect(canAccessFeature("trouvetouBoost", "croissance")).toBe(false);
    expect(canAccessFeature("trouvetouBoost", "entreprise")).toBe(true);
  });

  it("débloque le module RH (dossiers employés) dès la Croissance", () => {
    expect(canAccessFeature("hrModule", "essentiel")).toBe(false);
    expect(canAccessFeature("hrModule", "croissance")).toBe(true);
    expect(canAccessFeature("hrModule", "entreprise")).toBe(true);
    expect(canAccessFeature("hrModule", "free")).toBe(false);
  });

  it("propose le portail client en 3 niveaux : aucun / lecture seule / complet", () => {
    expect(getClientPortalMode("free")).toBe("none");
    expect(getClientPortalMode("essentiel")).toBe("none");
    expect(getClientPortalMode("croissance")).toBe("readonly");
    expect(getClientPortalMode("entreprise")).toBe("full");
    expect(getClientPortalMode("enterprise")).toBe("full");
  });

  it("fixe les limites d'usage par palier", () => {
    expect(getPlanLimits("essentiel").maxUnits).toBe(10);
    expect(getPlanLimits("croissance").maxUnits).toBe(35);
    expect(getPlanLimits("croissance").maxUsers).toBe(5);
    expect(getPlanLimits("entreprise").maxUnits).toBeNull();
  });

  it("fournit les liens de paiement Wave par forfait", () => {
    expect(getWavePayLink("essentiel")).toBe(
      "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=9900"
    );
    expect(getWavePayLink("croissance")).toBe(
      "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=24900"
    );
    expect(getWavePayLink("entreprise")).toBe(
      "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=54900"
    );
    expect(getWavePayLink("standard")).toBe(getWavePayLink("essentiel"));
    expect(getWavePayLink("enterprise")).toBe(getWavePayLink("entreprise"));
    expect(getWavePayLink("free")).toBe("");
  });
});
