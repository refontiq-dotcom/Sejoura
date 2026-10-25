import { describe, expect, it } from "vitest";
import {
  buildVitrineContent,
  buildVitrineUrl,
  type VitrineAccommodationInput,
} from "@/lib/website/vitrine";

const base: VitrineAccommodationInput = {
  name: "Hôtel Abidjan Plaza",
  description: "Un établissement au cœur d'Abidjan.",
  address: "Rue des Jardins",
  city: "Abidjan",
  country: "Côte d'Ivoire",
  contact_phone: "+225 01 02 03 04 05",
  logo_url: "https://cdn.example.com/logo.png",
  image_url: "https://cdn.example.com/hotel.jpg",
  website_url: null,
  room_types: [
    {
      name: "Suite",
      description: "Suite spacieuse.",
      base_price: 75000,
      capacity: 2,
      amenities: ["Wifi", "Climatisation"],
      featured_images: [
        "https://cdn.example.com/suite.jpg",
        "https://cdn.example.com/hotel.jpg",
      ],
    },
  ],
};

describe("buildVitrineUrl", () => {
  it("construit l'URL publique Séjoura par défaut", () => {
    expect(buildVitrineUrl("hotel-abidjan-plaza")).toBe(
      "https://www.sejoura.com/site/hotel-abidjan-plaza"
    );
  });

  it("utilise le domaine personnalisé en HTTPS", () => {
    expect(buildVitrineUrl("hotel-abidjan-plaza", "http://hotel.example.com/")).toBe(
      "https://hotel.example.com"
    );
  });
});

describe("buildVitrineContent", () => {
  it("construit le contenu public de l'établissement et de ses chambres", () => {
    const content = buildVitrineContent(base, { slug: "hotel-abidjan-plaza" });

    expect(content.title).toBe("Hôtel Abidjan Plaza");
    expect(content.tagline).toBe("Un séjour à Abidjan, Côte d'Ivoire");
    expect(content.address).toBe("Rue des Jardins, Abidjan, Côte d'Ivoire");
    expect(content.rooms).toEqual([
      {
        name: "Suite",
        description: "Suite spacieuse.",
        capacity: 2,
        amenities: ["Wifi", "Climatisation"],
        price: 75000,
        images: [
          "https://cdn.example.com/suite.jpg",
          "https://cdn.example.com/hotel.jpg",
        ],
      },
    ]);
  });

  it("construit la galerie sans doublon à partir des images disponibles", () => {
    const content = buildVitrineContent(base, { slug: "hotel-abidjan-plaza" });

    expect(content.gallery).toEqual([
      "https://cdn.example.com/hotel.jpg",
      "https://cdn.example.com/suite.jpg",
    ]);
    expect(content.heroImageUrl).toBe("https://cdn.example.com/hotel.jpg");
  });

  it("fournit des valeurs de repli quand les informations sont absentes", () => {
    const content = buildVitrineContent(
      {
        ...base,
        name: " ",
        description: null,
        address: null,
        city: null,
        country: null,
        logo_url: null,
        image_url: null,
        room_types: [],
      },
      { slug: "etablissement" }
    );

    expect(content.title).toBe("Votre établissement");
    expect(content.description).toBe("Découvrez Votre établissement et ses chambres.");
    expect(content.address).toBeNull();
    expect(content.logoUrl).toBeNull();
    expect(content.heroImageUrl).toBeNull();
    expect(content.rooms).toEqual([]);
    expect(content.gallery).toEqual([]);
  });
});
