import { describe, it, expect } from "vitest";
import {
  EMPTY_ROOM_TYPE_FORM,
  isValidPhotoUrl,
  normalizeRoomTypeName,
  toRoomTypeInsertPayload,
  toRoomTypeUpdatePayload,
  validateRoomTypeForm,
  type RoomTypeFormState,
} from "../src/lib/validations/rooms";
import { describeRoomTypeError } from "../src/lib/room-type-errors";

const ACC = "11111111-1111-4111-8111-111111111111";

function form(overrides: Partial<RoomTypeFormState> = {}): RoomTypeFormState {
  return { ...EMPTY_ROOM_TYPE_FORM, accommodation_id: ACC, name: "Studio", base_price: "15000", ...overrides };
}

describe("validateRoomTypeForm — champs numériques", () => {
  it("accepte un formulaire valide", () => {
    const r = validateRoomTypeForm(form());
    expect(r.success).toBe(true);
  });

  it.each([["0"], ["-500"], ["15000.5"], ["abc"], [""]])("refuse le prix %j", (price) => {
    const r = validateRoomTypeForm(form({ base_price: price }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.base_price).toBeTruthy();
  });

  it.each([["0"], [""], ["-1"], ["2.5"]])("refuse la capacité %j", (cap) => {
    const r = validateRoomTypeForm(form({ capacity: cap }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.capacity).toBeTruthy();
  });

  it("accepte la surface avec virgule française et la laisse vide si non renseignée", () => {
    const withComma = validateRoomTypeForm(form({ surface_m2: "25,5" }));
    expect(withComma.success && withComma.data.surface_m2).toBe(25.5);
    const empty = validateRoomTypeForm(form({ surface_m2: "" }));
    expect(empty.success && empty.data.surface_m2).toBeNull();
  });

  it("refuse une surface négative ou nulle", () => {
    expect(validateRoomTypeForm(form({ surface_m2: "-5" })).success).toBe(false);
    expect(validateRoomTypeForm(form({ surface_m2: "0" })).success).toBe(false);
  });

  it("refuse une heure de sortie vide ou invalide", () => {
    expect(validateRoomTypeForm(form({ check_out_time: "" })).success).toBe(false);
    expect(validateRoomTypeForm(form({ check_out_time: "25:99" })).success).toBe(false);
  });
});

describe("validateRoomTypeForm — nom et description", () => {
  it("nettoie les espaces du nom", () => {
    const r = validateRoomTypeForm(form({ name: "  Studio  " }));
    expect(r.success && r.data.name).toBe("Studio");
  });

  it("refuse un nom vide, ou trop long (> 100)", () => {
    expect(validateRoomTypeForm(form({ name: "   " })).success).toBe(false);
    expect(validateRoomTypeForm(form({ name: "x".repeat(101) })).success).toBe(false);
  });

  it("refuse une description de plus de 500 caractères", () => {
    const r = validateRoomTypeForm(form({ description: "x".repeat(501) }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.description).toBeTruthy();
  });

  it("détecte un doublon quelle que soit la casse et les espaces", () => {
    const r = validateRoomTypeForm(form({ name: "  STUDIO " }), { existingNames: ["Suite", "studio"] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.name).toMatch(/existe déjà/);
  });

  it("normalizeRoomTypeName écrase les espaces multiples", () => {
    expect(normalizeRoomTypeName("  Chambre   Standard ")).toBe("chambre standard");
  });
});

describe("validateRoomTypeForm — Trouvetou et photos", () => {
  it("refuse Trouvetou sans photo", () => {
    const r = validateRoomTypeForm(form({ is_listed_on_trouvetou: true }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.featured_images).toBeTruthy();
  });

  it("refuse plus de 4 photos", () => {
    const imgs = Array.from({ length: 5 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    expect(validateRoomTypeForm(form({ featured_images: imgs })).success).toBe(false);
  });

  it("isValidPhotoUrl n'accepte que https avec un domaine", () => {
    expect(isValidPhotoUrl("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isValidPhotoUrl("http://cdn.example.com/a.jpg")).toBe(false);
    expect(isValidPhotoUrl("javascript:alert(1)")).toBe(false);
    expect(isValidPhotoUrl("pas une url")).toBe(false);
  });
});

describe("payloads", () => {
  it("convertit la description vide en NULL et n'envoie pas accommodation_id à l'UPDATE", () => {
    const r = validateRoomTypeForm(form({ description: "   " }));
    if (!r.success) throw new Error("attendu : succès");
    expect(toRoomTypeInsertPayload(r.data).description).toBeNull();
    expect(toRoomTypeInsertPayload(r.data).accommodation_id).toBe(ACC);
    expect("accommodation_id" in toRoomTypeUpdatePayload(r.data)).toBe(false);
  });
});

describe("describeRoomTypeError", () => {
  it("traduit les codes PostgreSQL courants", () => {
    expect(describeRoomTypeError({ code: "23505" }, "save")).toMatch(/existe déjà/);
    expect(describeRoomTypeError({ code: "23503" }, "delete")).toMatch(/chambres/);
    expect(describeRoomTypeError({ code: "23514", message: "chk_trouvetou_requires_photo" }, "save")).toMatch(/photo/);
    expect(describeRoomTypeError({ code: "42501" }, "save")).toMatch(/droits/);
  });

  it("conserve le message exact quand l'erreur est inconnue", () => {
    expect(describeRoomTypeError({ message: "boom" }, "save")).toContain("boom");
  });
});

import { describeRoomDeleteError } from "../src/lib/room-type-errors";

describe("describeRoomDeleteError", () => {
  it("explique qu'une chambre avec réservations ne peut pas être supprimée", () => {
    expect(describeRoomDeleteError({ code: "23503" })).toMatch(/réservations/);
  });
  it("traduit les droits insuffisants et conserve les autres messages", () => {
    expect(describeRoomDeleteError({ code: "42501" })).toMatch(/droits/);
    expect(describeRoomDeleteError({ message: "boom" })).toContain("boom");
  });
});
