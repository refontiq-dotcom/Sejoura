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

export function LanguageProvider({ children, initialLang = "fr" }: { children: ReactNode; initialLang?: Lang }) {
  // Initialiser avec la langue fournie par le serveur (via le cookie)
  const [lang, setLangState] = useState<Lang>(initialLang);

  // Lire la préférence stockée uniquement après l'hydratation côté client
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Si localStorage contient une langue différente de celle du serveur, on l'applique
    if (stored === "en" || stored === "fr") {
      if (stored !== lang) {
        setLangState(stored);
      }
    }
  }, []); // On ne met volontairement pas `lang` dans les dépendances pour éviter une boucle

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, lang);
    document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
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
