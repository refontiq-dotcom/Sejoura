import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/hooks/use-language";
import { CurrencyProvider } from "@/hooks/use-currency";
import { AccommodationProvider } from "@/hooks/use-accommodation";
import { InlineScript } from "@/components/inline-script";
import { ThemeToaster } from "@/components/providers/theme-toaster";

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
};

export const metadata: Metadata = {
  title: "Séjoura by Refontiq — Gestion d'établissements",
  description: "Application SaaS de gestion d'établissements et de chambres",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <InlineScript
          html={`(function(){try{var t=localStorage.getItem('sejoura-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}var c=localStorage.getItem('sejoura-theme-color');if(c&&/^#[0-9a-f]{6}$/i.test(c)){document.documentElement.style.setProperty('--sidebar-bg',c);document.documentElement.style.setProperty('--primary-color',c);}var l=localStorage.getItem('sejoura-lang');if(l==='en'||l==='fr'){document.documentElement.lang=l;}}catch(e){}})()`}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-background text-foreground theme-transition">
        <ThemeProvider>
          <LanguageProvider>
            <AccommodationProvider>
              <CurrencyProvider>
                {children}
                <ThemeToaster />
              </CurrencyProvider>
            </AccommodationProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
