"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Lang = "fr" | "en";

const STORAGE_KEY = "sejoura-lang";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Toujours initialiser à "fr" pour correspondre au rendu serveur (évite les mismatches d'hydratation)
  const [lang, setLangState] = useState<Lang>("fr");

  // Lire la préférence stockée uniquement après l'hydratation côté client
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "fr") {
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (value: Lang) => setLangState(value);
  const toggle = () => setLangState((prev) => (prev === "fr" ? "en" : "fr"));

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
