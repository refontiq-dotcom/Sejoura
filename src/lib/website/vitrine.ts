export interface VitrineRoomInput {
  name: string;
  description: string | null;
  base_price: number;
  capacity: number;
  amenities: string[] | null;
  featured_images: string[] | null;
}

export interface VitrineAccommodationInput {
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  image_url: string | null;
  website_url: string | null;
  room_types: VitrineRoomInput[];
}

export interface VitrineContent {
  title: string;
  tagline: string;
  description: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  address: string | null;
  domainLabel: string;
  amenities: string[];
  rooms: Array<{
    name: string;
    description: string | null;
    capacity: number;
    amenities: string[];
    price: number;
    images: string[];
  }>;
  gallery: string[];
}

interface VitrineOptions {
  slug: string;
  customDomain?: string | null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function buildVitrineUrl(slug: string, customDomain?: string | null): string {
  if (customDomain?.trim()) {
    const domain = customDomain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    return `https://${domain}`;
  }

  return `https://www.sejoura.com/site/${encodeURIComponent(slug)}`;
}

export function buildVitrineContent(
  accommodation: VitrineAccommodationInput,
  options: VitrineOptions
): VitrineContent {
  const title = accommodation.name.trim() || "Votre établissement";
  const city = accommodation.city?.trim();
  const country = accommodation.country?.trim();
  const location = [city, country].filter(Boolean).join(", ");
  const address = uniqueStrings([accommodation.address, city, country]).join(", ") || null;
  const rooms = accommodation.room_types.map((room) => ({
    name: room.name,
    description: room.description?.trim() || null,
    capacity: room.capacity,
    amenities: uniqueStrings(room.amenities ?? []),
    price: room.base_price,
    images: uniqueStrings(room.featured_images ?? []),
  }));
  const gallery = uniqueStrings([
    accommodation.image_url,
    ...rooms.flatMap((room) => room.images),
  ]);

  return {
    title,
    tagline: location ? `Un séjour à ${location}` : "Découvrez notre établissement",
    description:
      accommodation.description?.trim() ||
      `Découvrez ${title} et ses chambres.`,
    logoUrl: accommodation.logo_url?.trim() || null,
    heroImageUrl: gallery[0] ?? null,
    address,
    domainLabel: options.customDomain?.trim() || buildVitrineUrl(options.slug),
    amenities: uniqueStrings(rooms.flatMap((room) => room.amenities)),
    rooms,
    gallery,
  };
}