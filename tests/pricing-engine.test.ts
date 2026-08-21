import { describe, it, expect } from "vitest";
import {
  isHoliday,
  isWeekendDate,
  occupancyMultiplier,
  calculateDynamicPrice,
  formatPricingReason,
  getHolidaysForYear,
} from "../src/lib/pricing-engine";

describe("pricing-engine", () => {
  describe("isHoliday", () => {
    it("détecte le 1er janvier (Jour de l'An)", () => {
      expect(isHoliday(new Date(2026, 0, 1))).toBe("Jour de l'An");
    });

    it("détecte le 7 août (Fête Nationale)", () => {
      expect(isHoliday(new Date(2026, 7, 7))).toBe("Fête Nationale");
    });

    it("détecte Noël", () => {
      expect(isHoliday(new Date(2026, 11, 25))).toBe("Noël");
    });

    it("détecte le 1er mai (Fête du Travail)", () => {
      expect(isHoliday(new Date(2026, 4, 1))).toBe("Fête du Travail");
    });

    it("retourne null pour un jour normal", () => {
      expect(isHoliday(new Date(2026, 5, 15))).toBeNull();
    });
  });

  describe("isWeekendDate", () => {
    it("samedi est un weekend", () => {
      // 2026-08-15 = samedi
      expect(isWeekendDate(new Date(2026, 7, 15))).toBe(true);
    });

    it("dimanche est un weekend", () => {
      // 2026-08-16 = dimanche
      expect(isWeekendDate(new Date(2026, 7, 16))).toBe(true);
    });

    it("vendredi est un weekend", () => {
      // 2026-08-14 = vendredi
      expect(isWeekendDate(new Date(2026, 7, 14))).toBe(true);
    });

    it("mercredi n'est pas un weekend", () => {
      // 2026-08-12 = mercredi
      expect(isWeekendDate(new Date(2026, 7, 12))).toBe(false);
    });
  });

  describe("occupancyMultiplier", () => {
    it("retourne le min quand l'occupation est à 0%", () => {
      const mult = occupancyMultiplier(0);
      expect(mult).toBeCloseTo(0.85, 2);
    });

    it("retourne le max quand l'occupation est à 100%", () => {
      const mult = occupancyMultiplier(1);
      expect(mult).toBeCloseTo(1.35, 2);
    });

    it("interpolation linéaire à 50%", () => {
      const mult = occupancyMultiplier(0.5);
      expect(mult).toBeCloseTo(1.1, 2);
    });

    it("clampe les valeurs hors range", () => {
      expect(occupancyMultiplier(-0.5)).toBeCloseTo(0.85, 2);
      expect(occupancyMultiplier(1.5)).toBeCloseTo(1.35, 2);
    });
  });

  describe("calculateDynamicPrice", () => {
    it("applique le prix de base en mi-saison sans surcharge", () => {
      // Mercredi en mars (mi-saison)
      const result = calculateDynamicPrice(
        20000,
        new Date(2026, 2, 11), // 11 mars 2026 = mercredi
        new Date(2026, 2, 13), // 13 mars 2026
        0.5,
      );
      // Mi-saison = 1.0, pas weekend, pas holiday, occ 50% = 1.1
      expect(result.seasonMultiplier).toBe(1.0);
      expect(result.isWeekend).toBe(false);
      expect(result.holidayName).toBeNull();
      expect(result.totalNights).toBe(2);
    });

    it("applique la surcharge weekend", () => {
      // Samedi en mois normal
      const result = calculateDynamicPrice(
        20000,
        new Date(2026, 7, 15), // samedi
        new Date(2026, 7, 17), // lundi
        0.5,
      );
      expect(result.isWeekend).toBe(true);
      expect(result.weekendMultiplier).toBe(1.15);
    });

    it("applique la surcharge jour férié", () => {
      // 7 août = Fête Nationale
      const result = calculateDynamicPrice(
        20000,
        new Date(2026, 7, 7),
        new Date(2026, 7, 9),
        0.5,
      );
      expect(result.holidayName).toBe("Fête Nationale");
      expect(result.holidayMultiplier).toBe(1.3);
    });

    it("applique la haute saison en janvier", () => {
      const result = calculateDynamicPrice(
        20000,
        new Date(2026, 0, 12), // lundi, pas weekend, pas holiday
        new Date(2026, 0, 14),
        0.5,
      );
      expect(result.seasonLabel).toBe("Haute saison");
      expect(result.seasonMultiplier).toBe(1.25);
    });

    it("calcule le total correctement", () => {
      const result = calculateDynamicPrice(
        10000,
        new Date(2026, 5, 15), // lundi en juin (mi-saison)
        new Date(2026, 5, 18), // 3 nuits
        0.5,
      );
      expect(result.totalNights).toBe(3);
      expect(result.basePrice).toBe(10000);
      // Mi-saison 1.0, pas weekend 1.0, pas holiday 1.0, occ 50% = 1.1
      expect(result.finalPrice).toBe(11000);
      expect(result.totalAmount).toBe(33000);
      expect(result.staticTotal).toBe(30000);
      expect(result.difference).toBe(3000);
    });
  });

  describe("formatPricingReason", () => {
    it("retourne 'Prix standard' sans surcharge", () => {
      const breakdown = calculateDynamicPrice(
        20000,
        new Date(2026, 5, 15), // lundi en juin
        new Date(2026, 5, 16),
        0.5,
        {
          weekendMultiplier: 1.15,
          holidayMultiplier: 1.3,
          seasonMultipliers: { low: 0.9, mid: 1.0, high: 1.25 },
          occupancyMultiplierRange: { min: 1.0, max: 1.0 }, // pas de surcharge occupation
          anomalyThreshold: 2.5,
        },
      );
      expect(formatPricingReason(breakdown)).toBe("Prix standard");
    });

    it("inclut les surcharges actives", () => {
      const breakdown = calculateDynamicPrice(
        20000,
        new Date(2026, 7, 7), // Fête Nationale, vendredi
        new Date(2026, 7, 9),
        0.8,
      );
      const reason = formatPricingReason(breakdown);
      expect(reason).toContain("Haute saison");
      expect(reason).toContain("Weekend");
      expect(reason).toContain("Fête Nationale");
      expect(reason).toContain("Occupation");
    });
  });

  describe("getHolidaysForYear", () => {
    it("retourne les jours fériés de l'année 2026", () => {
      const holidays = getHolidaysForYear(2026);
      expect(holidays.length).toBeGreaterThanOrEqual(10);

      // Vérifier que c'est trié par date
      for (let i = 1; i < holidays.length; i++) {
        expect(holidays[i].date.getTime()).toBeGreaterThanOrEqual(
          holidays[i - 1].date.getTime(),
        );
      }

      // Vérifier la présence de Noël
      const xmas = holidays.find((h) => h.label === "Noël");
      expect(xmas).toBeDefined();
      expect(xmas!.date.getMonth()).toBe(11);
      expect(xmas!.date.getDate()).toBe(25);
    });
  });
});
