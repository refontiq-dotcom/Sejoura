import type { MetadataRoute } from "next";

const NAVY = "#0C1C33";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Séjoura by Refontiq — Gestion d'établissements",
    short_name: "Séjoura",
    description:
      "Application SaaS de gestion d'établissements et de chambres meublées",
    start_url: "/?v=2",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: NAVY,
    theme_color: NAVY,
    categories: ["business", "productivity", "finance"],
    lang: "fr",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
