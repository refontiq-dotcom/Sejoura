"use client";

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type Lang = "fr" | "en";

const STORAGE_KEY = "sejoura-lang";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children, initialLang = "fr" }: { children: ReactNode; initialLang?: Lang }) {
  // Cookie = bootstrap SSR; user_preferences = persisted user UI preference.
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [preferenceResolved, setPreferenceResolved] = useState(false);
  const resolvedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    localStorage.setItem(STORAGE_KEY, lang);
    document.cookie = STORAGE_KEY + "=" + lang + "; path=/; max-age=31536000; SameSite=Lax";
    document.documentElement.lang = lang;

    if (!preferenceResolved || !resolvedUserIdRef.current) return;

    const supabase = createClient();
    void supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: resolvedUserIdRef.current,
          language: lang,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .then(({ error }) => {
        if (error) console.error("[i18n] unable to persist language preference", error);
      });
  }, [lang, preferenceResolved]);

  useEffect(() => {
    let cancelled = false;

    async function resolveUserPreference() {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();

        if (!authData.user || cancelled) {
          if (!cancelled) setPreferenceResolved(true);
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", authData.user.id)
          .maybeSingle();

        if (userError || !userData || cancelled) {
          if (!cancelled) setPreferenceResolved(true);
          return;
        }

        resolvedUserIdRef.current = userData.id;

        const { data: preference, error: preferenceError } = await supabase
          .from("user_preferences")
          .select("language")
          .eq("user_id", userData.id)
          .maybeSingle();

        if (!cancelled && !preferenceError && (preference?.language === "fr" || preference?.language === "en")) {
          setLangState(preference.language as Lang);
        }
      } catch (error) {
        console.error("[i18n] unable to resolve language preference", error);
      } finally {
        if (!cancelled) setPreferenceResolved(true);
      }
    }

    void resolveUserPreference();

    return () => {
      cancelled = true;
    };
  }, []);

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
