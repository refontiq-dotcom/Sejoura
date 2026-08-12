// ============================================================================
// SÉJOURA — Commodités (Équipements) des chambres
// Liste partagée entre la Fiche Chambre (back-office) et le portail Trouvetou
// ============================================================================

export const ROOM_AMENITIES = [
  "Wifi",
  "Climatisation",
  "Télévision",
  "Chauffe-eau",
  "Parking",
  "Piscine",
  "Cuisine Équipée",
  "Groupe Électrogène",
  "Sécurité 24/7",
  "Générateur de secours",
  "Petit-déjeuner",
  "Salle de bain privée",
  "Balcon",
  "Bureau",
] as const;

export type RoomAmenity = (typeof ROOM_AMENITIES)[number];
