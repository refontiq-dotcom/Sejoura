import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Séjoura Staff — Portail Employés",
  description: "Portail de connexion pour les employés Séjoura",
  manifest: "/manifest-staff.webmanifest",
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
