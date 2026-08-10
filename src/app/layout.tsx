import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/hooks/use-language";
import { CurrencyProvider } from "@/hooks/use-currency";
import { Toaster } from "sonner";
import { InlineScript } from "@/components/inline-script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
          html={`(function(){try{var t=localStorage.getItem('sejoura-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}var c=localStorage.getItem('sejoura-theme-color');if(c){document.documentElement.style.setProperty('--sidebar-bg',c);document.documentElement.style.setProperty('--primary-color',c);}var l=localStorage.getItem('sejoura-lang');if(l==='en'||l==='fr'){document.documentElement.lang=l;}}catch(e){}})()`}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-background text-foreground theme-transition">
        <ThemeProvider>
          <LanguageProvider>
            <CurrencyProvider>
              {children}
            </CurrencyProvider>
          </LanguageProvider>
        </ThemeProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
          theme="system"
          className="toaster-group"
          style={{
            fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          }}
        />
      </body>
    </html>
  );
}
