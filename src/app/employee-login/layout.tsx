import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Séjoura Staff — Portail Employés",
  description: "Portail de connexion pour les employés Séjoura",
  // Le manifest PWA principal (src/app/manifest.ts) s'applique à toutes les
  // routes. L'ancien manifest staff (scope "/employee-login") interceptait
  // l'installation PWA et forçait start_url="/employee-login", empêchant
  // la page officielle Séjoura de s'afficher au démarrage.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Staff",
  },
  formatDetection: {
    telephone: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0C1C33",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function EmployeeLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
