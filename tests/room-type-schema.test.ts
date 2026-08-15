import { describe, it, expect } from "vitest";
import { roomTypeSchema } from "../src/lib/validations/rooms";

// ──────────────────────────────────────────────────────────────────────────────
// Tests du schéma de validation des types de chambre (cœur de l'intégration)
// Garde-fou photo : is_listed_on_trouvetou = true exige au moins une photo.
// ──────────────────────────────────────────────────────────────────────────────

function baseType(overrides: Record<string, unknown> = {}) {
  return {
    accommodation_id: "11111111-1111-4111-8111-111111111111",
    name: "Studio",
    base_price: 15000,
    capacity: 2,
    amenities: [],
    ...overrides,
  };
}

describe("roomTypeSchema — garde-fou Visibilité Trouvetou", () => {
  it("accepte un type hors Trouvetou sans photo", () => {
    const result = roomTypeSchema.safeParse(baseType({ is_listed_on_trouvetou: false, featured_images: [] }));
    expect(result.success).toBe(true);
  });

  it("refuse l'activation de l'interrupteur sans photo", () => {
    const result = roomTypeSchema.safeParse(baseType({ is_listed_on_trouvetou: true, featured_images: [] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("featured_images"))).toBe(true);
    }
  });

  it("accepte l'interrupteur ON avec au moins une photo", () => {
    const result = roomTypeSchema.safeParse(
      baseType({ is_listed_on_trouvetou: true, featured_images: ["https://example.com/photo.jpg"] })
    );
    expect(result.success).toBe(true);
  });

  it("accepte une superficie optionnelle positive", () => {
    const ok = roomTypeSchema.safeParse(baseType({ surface_m2: 25 }));
    expect(ok.success).toBe(true);

    const neg = roomTypeSchema.safeParse(baseType({ surface_m2: -5 }));
    expect(neg.success).toBe(false);
  });

  it("rejette une superficie optionnelle nulle ou absente (champ libre)", () => {
    const none = roomTypeSchema.safeParse(baseType({ surface_m2: null }));
    expect(none.success).toBe(true);

    const missing = roomTypeSchema.safeParse(baseType({}));
    expect(missing.success).toBe(true);
  });

  it("accepte la liste de commodités", () => {
    const result = roomTypeSchema.safeParse(
      baseType({ amenities: ["Wifi", "Climatisation"] })
    );
    expect(result.success).toBe(true);
  });

  describe("check_out_time — heure de sortie du type de chambre", () => {
    it("définit l'heure de sortie par défaut à 11:00", () => {
      const result = roomTypeSchema.safeParse(baseType({}));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.check_out_time).toBe("11:00");
      }
    });

    it("accepte une heure de sortie valide", () => {
      const result = roomTypeSchema.safeParse(baseType({ check_out_time: "12:30" }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.check_out_time).toBe("12:30");
      }
    });

    it("refuse une heure invalide", () => {
      const bad = roomTypeSchema.safeParse(baseType({ check_out_time: "25:99" }));
      expect(bad.success).toBe(false);
      if (!bad.success) {
        expect(bad.error.issues.some((i) => i.path.includes("check_out_time"))).toBe(true);
      }
    });
  });
});
