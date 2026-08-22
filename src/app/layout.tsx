import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/hooks/use-language";
import { CurrencyProvider } from "@/hooks/use-currency";
import { AccommodationProvider } from "@/hooks/use-accommodation";
import { InlineScript } from "@/components/inline-script";
import { ThemeToaster } from "@/components/providers/theme-toaster";
import { PwaRegister } from "@/components/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0C1C33",
};

export const metadata: Metadata = {
  title: {
    default: "Séjoura — Gestion d'établissements et d'hébergement",
    template: "%s | Séjoura",
  },
  description:
    "Séjoura est la plateforme SaaS complète pour gérer votre établissement d'hébergement : réservations, chambres, facturation, personnel, et listing sur Trouvetou. Simple, rapide, pensé pour l'Afrique.",
  keywords: [
    "gestion hôtel",
    "gestion chambre",
    "réservation hôtel",
    "SaaS hébergement",
    "logiciel hôtel Afrique",
    "gestion établissement",
    "facturation hôtel",
    "Trouvetou",
    "Séjoura",
  ],
  authors: [{ name: "Refontiq", url: "https://refontiq.com" }],
  creator: "Refontiq",
  publisher: "Refontiq",
  applicationName: "Séjoura",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: {
      url: "/icons/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
  openGraph: {
    type: "website",
    locale: "fr_CI",
    url: "https://sejoura.com",
    siteName: "Séjoura",
    title: "Séjoura — Gestion d'établissements et d'hébergement",
    description:
      "La plateforme SaaS complète pour gérer votre établissement d'hébergement : réservations, chambres, facturation, personnel, et listing sur Trouvetou.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Séjoura — Gestion d'établissements",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Séjoura — Gestion d'établissements",
    description:
      "La plateforme SaaS complète pour gérer votre établissement d'hébergement.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: "Séjoura",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("sejoura-lang")?.value;
  const initialLang = (langCookie === "en" || langCookie === "fr") ? langCookie : "fr";

  return (
    <html
      lang={initialLang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <InlineScript
          html={`(function(){try{var t=localStorage.getItem('sejoura-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}var c=localStorage.getItem('theme_color');if(c&&/^#[0-9a-f]{6}$/i.test(c)){document.documentElement.style.setProperty('--sidebar-bg',c);document.documentElement.style.setProperty('--primary-color',c);}var l=localStorage.getItem('sejoura-lang');if(l==='en'||l==='fr'){document.documentElement.lang=l;}}catch(e){}})()`}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-background text-foreground theme-transition">
        <ThemeProvider>
          <LanguageProvider initialLang={initialLang}>
            <AccommodationProvider>
              <CurrencyProvider>
                {children}
                <ThemeToaster />
              </CurrencyProvider>
            </AccommodationProvider>
          </LanguageProvider>
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
