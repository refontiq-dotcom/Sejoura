import {
  Wifi,
  Clock,
  Car,
  Waves,
  UtensilsCrossed,
  Coffee,
  Bed,
  KeyRound,
  MapPin,
  Phone,
  Info,
  CalendarDays,
  Sparkles,
  Shield,
  Star,
  DoorOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getThemePresetById } from "@/lib/colors";

/**
 * Résout la couleur primaire de l'établissement : accepte un hex (#0C1C33) ou
 * un identifiant de thème ("navy") stocké en base (settings → thème).
 * Utilisé par la page /stay et par l'aperçu live de l'éditeur.
 */
export function resolvePrimaryColor(value?: string | null): string {
  if (!value || !value.trim()) return "#0C1C33";
  const clean = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  return getThemePresetById(clean).sidebarBg;
}

/**
 * Icônes disponibles pour les « infos pratiques » de l'espace client.
 * La clé est la valeur stockée en base (tenants.guest_info.practical_info[].icon) ;
 * une clé inconnue retombe sur l'icône Info côté affichage.
 */
export const GUEST_INFO_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  clock: Clock,
  parking: Car,
  pool: Waves,
  restaurant: UtensilsCrossed,
  breakfast: Coffee,
  bed: Bed,
  key: KeyRound,
  map: MapPin,
  phone: Phone,
  info: Info,
  calendar: CalendarDays,
  cleaning: Sparkles,
  shield: Shield,
  star: Star,
  door: DoorOpen,
};

/** Liste ordonnée des choix proposés à l'admin dans l'éditeur. */
export const GUEST_INFO_ICON_OPTIONS: { name: string; label: string }[] = [
  { name: "wifi", label: "Wi-Fi" },
  { name: "clock", label: "Horaires" },
  { name: "breakfast", label: "Petit-déjeuner" },
  { name: "restaurant", label: "Restaurant" },
  { name: "parking", label: "Parking" },
  { name: "pool", label: "Piscine" },
  { name: "bed", label: "Literie" },
  { name: "cleaning", label: "Ménage" },
  { name: "key", label: "Accès / Clés" },
  { name: "door", label: "Porte" },
  { name: "calendar", label: "Dates" },
  { name: "map", label: "Adresse / Itinéraire" },
  { name: "phone", label: "Téléphone" },
  { name: "shield", label: "Sécurité" },
  { name: "star", label: "Bonne adresse" },
  { name: "info", label: "Info" },
];

export function getGuestInfoIcon(name: string): LucideIcon {
  return GUEST_INFO_ICONS[name] ?? Info;
}
