import { z } from "zod";

export const roomSchema = z.object({
  accommodation_id: z.string().uuid("Établissement invalide"),
  room_type_id: z.string().uuid("Type de chambre invalide"),
  room_number: z.string().min(1, "Numéro de chambre requis").max(20, "Numéro trop long"),
  floor: z.number().int().nonnegative("Étage invalide").nullable().optional(),
  status: z.enum(["available", "occupied", "alert", "cleaning"]).default("available"),
  notes: z.string().max(500, "Notes trop longues").optional(),
});

export const roomTypeSchema = z.object({
  accommodation_id: z.string().uuid("Établissement invalide"),
  name: z.string().trim().min(1, "Nom requis").max(100, "Nom trop long"),
  description: z.string().trim().max(500, "Description trop longue").optional(),
  base_price: z.number().int("Le prix doit être un nombre entier").positive("Le prix doit être supérieur à 0"),
  capacity: z.number().int("La capacité doit être un nombre entier").positive("La capacité doit être d'au moins 1").max(50, "Capacité trop élevée").default(2),
  amenities: z.array(z.string()).default([]),
  surface_m2: z.number().positive("La surface doit être supérieure à 0").max(10000, "Surface trop élevée").nullable().optional(),
  is_listed_on_trouvetou: z.boolean().default(false),
  featured_images: z.array(z.string()).max(4, "4 photos maximum pour Trouvetou").default([]),
  check_out_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure de sortie invalide (HH:MM)")
    .default("11:00"),
}).superRefine((data, ctx) => {
  if (data.is_listed_on_trouvetou && data.featured_images.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["featured_images"],
      message: "Ajoutez une photo pour activer Trouvetou 📸",
    });
  }
});

export type RoomFormData = z.infer<typeof roomSchema>;
export type RoomTypeFormData = z.infer<typeof roomTypeSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Formulaire « type de chambre » — état brut (chaînes) → données validées
// Partagé par l'écran Établissement et par l'onboarding.
// ──────────────────────────────────────────────────────────────────────────────

export const ROOM_TYPE_MAX_PHOTOS = 4;

export type RoomTypeFormState = {
  name: string;
  description: string;
  base_price: string;
  capacity: string;
  accommodation_id: string;
  amenities: string[];
  surface_m2: string;
  is_listed_on_trouvetou: boolean;
  featured_images: string[];
  check_out_time: string;
};

export const EMPTY_ROOM_TYPE_FORM: RoomTypeFormState = {
  name: "",
  description: "",
  base_price: "",
  capacity: "2",
  accommodation_id: "",
  amenities: [],
  surface_m2: "",
  is_listed_on_trouvetou: false,
  featured_images: [],
  check_out_time: "11:00",
};

export type RoomTypeFormErrors = Partial<Record<keyof RoomTypeFormState, string>>;

export type RoomTypeFormResult =
  | { success: true; data: RoomTypeFormData }
  | { success: false; errors: RoomTypeFormErrors };

/** Forme canonique d'un nom, pour comparer « Studio », « studio » et « Studio  ». */
export function normalizeRoomTypeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Une photo doit être une URL https:// (évite le contenu mixte et les chaînes libres). */
export function isValidPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function parseStrictInteger(raw: string): number | null {
  const value = raw.trim();
  return /^\d+$/.test(value) ? Number(value) : null;
}

function parseDecimal(raw: string): number | null {
  const value = raw.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

/**
 * Valide l'état brut du formulaire avec roomTypeSchema.
 * @param existingNames noms déjà pris dans l'établissement (hors type en cours d'édition)
 */
export function validateRoomTypeForm(
  form: RoomTypeFormState,
  options: { existingNames?: string[] } = {}
): RoomTypeFormResult {
  const errors: RoomTypeFormErrors = {};

  const basePrice = form.base_price.trim() === "" ? null : parseStrictInteger(form.base_price);
  if (form.base_price.trim() === "") errors.base_price = "Prix requis";
  else if (basePrice === null) errors.base_price = "Entrez un nombre entier, sans décimale ni signe";

  const capacity = form.capacity.trim() === "" ? null : parseStrictInteger(form.capacity);
  if (form.capacity.trim() === "") errors.capacity = "Capacité requise";
  else if (capacity === null) errors.capacity = "Entrez un nombre entier";

  let surface: number | null = null;
  if (form.surface_m2.trim() !== "") {
    surface = parseDecimal(form.surface_m2);
    if (surface === null) errors.surface_m2 = "Surface invalide (ex : 25 ou 25,5)";
  }

  if (!form.check_out_time.trim()) errors.check_out_time = "Heure de sortie requise";

  const parsed = roomTypeSchema.safeParse({
    accommodation_id: form.accommodation_id,
    name: form.name,
    description: form.description,
    base_price: basePrice ?? undefined,
    capacity: capacity ?? undefined,
    amenities: form.amenities,
    surface_m2: surface,
    is_listed_on_trouvetou: form.is_listed_on_trouvetou,
    featured_images: form.featured_images,
    check_out_time: form.check_out_time,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof RoomTypeFormState | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }

  if (!errors.name && options.existingNames) {
    const wanted = normalizeRoomTypeName(form.name);
    if (options.existingNames.some((n) => normalizeRoomTypeName(n) === wanted)) {
      errors.name = "Ce nom existe déjà dans cet établissement";
    }
  }

  if (Object.keys(errors).length > 0 || !parsed.success) {
    return { success: false, errors };
  }
  return { success: true, data: parsed.data };
}

/** Données prêtes pour un INSERT : champ vide → NULL, nom/description nettoyés. */
export function toRoomTypeInsertPayload(data: RoomTypeFormData) {
  return {
    accommodation_id: data.accommodation_id,
    name: data.name,
    description: data.description ? data.description : null,
    base_price: data.base_price,
    capacity: data.capacity,
    amenities: data.amenities,
    surface_m2: data.surface_m2 ?? null,
    is_listed_on_trouvetou: data.is_listed_on_trouvetou,
    featured_images: data.featured_images.slice(0, ROOM_TYPE_MAX_PHOTOS),
    check_out_time: data.check_out_time,
  };
}

/** Pour un UPDATE : l'établissement d'un type ne change jamais. */
export function toRoomTypeUpdatePayload(data: RoomTypeFormData) {
  const { accommodation_id: _ignored, ...rest } = toRoomTypeInsertPayload(data);
  void _ignored;
  return rest;
}
