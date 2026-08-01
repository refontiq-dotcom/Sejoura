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
  name: z.string().min(1, "Nom requis").max(100, "Nom trop long"),
  description: z.string().max(500, "Description trop longue").optional(),
  base_price: z.number().int().nonnegative("Prix invalide"),
  capacity: z.number().int().positive("Capacité invalide").default(2),
  amenities: z.array(z.string()).default([]),
});

export type RoomFormData = z.infer<typeof roomSchema>;
export type RoomTypeFormData = z.infer<typeof roomTypeSchema>;
