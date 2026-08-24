import type { MetadataRoute } from "next";

const NAVY = "#0C1C33";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Séjoura Staff — Portail Employés",
    short_name: "Staff",
    description:
      "Portail de connexion pour les employés Séjoura",
    start_url: "/employee-login",
    scope: "/employee-login",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: NAVY,
    categories: ["business", "productivity"],
    lang: "fr",
    icons: [
      {
        src: "/icons/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
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
    ],
  };
}
