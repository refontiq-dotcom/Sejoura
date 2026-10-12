import { describe, it, expect } from "vitest";
import {
  normalizeAccommodationType,
  resolveTrouvetouCategorySlug,
  DEFAULT_ACCOMMODATION_TYPE,
} from "../src/lib/trouvetou/category";

// ──────────────────────────────────────────────────────────────────────────────
// Résolution de la catégorie Trouvetou d'un établissement.
// Régression : la sync envoyait `category_slug` = "residence" ou "hotel" en
// dur depuis `accommodations.description` ('bnb' → residence, tout le reste →
// hotel). La classification vit désormais dans `accommodation_type`.
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveTrouvetouCategorySlug — accommodation_type dédié", () => {
  it("mappe accommodation_type = 'residence' vers le slug residence", () => {
    expect(resolveTrouvetouCategorySlug({ accommodation_type: "residence" })).toBe("residence");
  });

  it("mappe accommodation_type = 'hotel' vers le slug hotel", () => {
    expect(resolveTrouvetouCategorySlug({ accommodation_type: "hotel" })).toBe("hotel");
  });

  it("normalise la casse et les accents", () => {
    expect(resolveTrouvetouCategorySlug({ accommodation_type: "Residence" })).toBe("residence");
    expect(resolveTrouvetouCategorySlug({ accommodation_type: " HÔTEL " })).toBe("hotel");
  });

  it("privilégie accommodation_type sur l'ancien marqueur description", () => {
    // Données incohérentes : le champ dédié fait foi.
    expect(
      resolveTrouvetouCategorySlug({ accommodation_type: "hotel", description: "bnb" })
    ).toBe("hotel");
    expect(
      resolveTrouvetouCategorySlug({ accommodation_type: "residence", description: "hotel" })
    ).toBe("residence");
  });
});

describe("resolveTrouvetouCategorySlug — repli legacy (description)", () => {
  it(" classe en 'residence' quand description = 'bnb' (données non migrées)", () => {
    expect(resolveTrouvetouCategorySlug({ description: "bnb" })).toBe("residence");
  });

  it("classe en 'hotel' pour description = 'hotel'", () => {
    expect(resolveTrouvetouCategorySlug({ description: "hotel" })).toBe("hotel");
  });

  it("classe en 'hotel' pour une description libre ou absente", () => {
    expect(resolveTrouvetouCategorySlug({ description: "Belle villa avec piscine" })).toBe("hotel");
    expect(resolveTrouvetouCategorySlug({})).toBe("hotel");
    expect(resolveTrouvetouCategorySlug({ accommodation_type: null, description: null })).toBe(
      "hotel"
    );
  });

  it("classe en 'hotel' pour une valeur de type inconnue", () => {
    expect(resolveTrouvetouCategorySlug({ accommodation_type: "villa" })).toBe(
      DEFAULT_ACCOMMODATION_TYPE
    );
  });
});

describe("normalizeAccommodationType — saisie d'inscription", () => {
  it("accepte les valeurs du formulaire d'onboarding", () => {
    expect(normalizeAccommodationType("residence")).toBe("residence");
    expect(normalizeAccommodationType("hotel")).toBe("hotel");
  });

  it("accepte l'ancienne valeur 'bnb' (clients JS en cache)", () => {
    expect(normalizeAccommodationType("bnb")).toBe("residence");
    expect(normalizeAccommodationType("BnB")).toBe("residence");
  });

  it("retombe sur le type par défaut pour toute autre valeur", () => {
    expect(normalizeAccommodationType("")).toBe(DEFAULT_ACCOMMODATION_TYPE);
    expect(normalizeAccommodationType(undefined)).toBe(DEFAULT_ACCOMMODATION_TYPE);
    expect(normalizeAccommodationType("gîte")).toBe(DEFAULT_ACCOMMODATION_TYPE);
  });
});
