import type { Metadata } from "next";
import { HomePage } from "@/components/home/home-page";

export const metadata: Metadata = {
  title: "Séjoura — Solution tout-en-un pour hôtels & résidences",
  description:
    "La gestion simple de vos résidences et hôtels. Zéro frais d'installation. Suivez vos paiements, vos équipes et votre caisse, jour après jour.",
  openGraph: {
    title: "Séjoura — Solution tout-en-un pour hôtels & résidences",
    description:
      "La gestion simple de vos résidences et hôtels. Zéro frais d'installation.",
    type: "website",
    locale: "fr_FR",
    siteName: "Séjoura",
  },
  twitter: {
    card: "summary_large_image",
    title: "Séjoura — Solution tout-en-un pour hôtels & résidences",
    description:
      "La gestion simple de vos résidences et hôtels. Zéro frais d'installation.",
  },
};

export default function Home() {
  return <HomePage />;
}