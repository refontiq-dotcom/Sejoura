import { describe, it, expect } from "vitest";
import {
  AD_DURATION_OPTIONS,
  getAdCampaignPrice,
  getAdStatusLabel,
  getAdWavePayLink,
  getRemainingAdDays,
  isValidAdDuration,
  isValidRedirectUrl,
} from "../src/lib/ads";

describe("ads pricing", () => {
  it("calcule le tarif selon la durée", () => {
    expect(getAdCampaignPrice(3)).toBe(15_000);
    expect(getAdCampaignPrice(7)).toBe(30_000);
    expect(getAdCampaignPrice(14)).toBe(55_000);
    expect(getAdCampaignPrice(30)).toBe(95_000);
    expect(getAdCampaignPrice(1)).toBe(0);
  });

  it("n'accepte que les durées tarifées", () => {
    for (const opt of AD_DURATION_OPTIONS) {
      expect(isValidAdDuration(opt.days)).toBe(true);
    }
    expect(isValidAdDuration(0)).toBe(false);
    expect(isValidAdDuration(90)).toBe(false);
  });

  it("construit le lien Wave avec le montant de campagne", () => {
    expect(getAdWavePayLink(30_000)).toContain("amount=30000");
    expect(getAdWavePayLink(0)).toBe("");
  });
});

describe("ads status and urls", () => {
  it("libelle les statuts du cycle de vie", () => {
    expect(getAdStatusLabel("draft")).toBe("Brouillon");
    expect(getAdStatusLabel("pending_payment")).toBe("En attente de validation");
    expect(getAdStatusLabel("active")).toBe("Active");
    expect(getAdStatusLabel("expired")).toBe("Expirée");
    expect(getAdStatusLabel("rejected")).toBe("Rejetée");
    expect(getAdStatusLabel("active", "en")).toBe("Active");
  });

  it("valide les liens de redirection", () => {
    expect(isValidRedirectUrl("https://trouvetou.com/offre")).toBe(true);
    expect(isValidRedirectUrl("http://localhost:3000")).toBe(true);
    expect(isValidRedirectUrl("javascript:alert(1)")).toBe(false);
    expect(isValidRedirectUrl("not-a-url")).toBe(false);
  });

  it("calcule les jours restants sans valeur négative", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(getRemainingAdDays(future)).toBeGreaterThanOrEqual(3);
    expect(getRemainingAdDays(past)).toBe(0);
    expect(getRemainingAdDays(null)).toBe(0);
  });
});
