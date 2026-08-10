"use client";

import { getThemePresetById, THEME_PRESETS, deriveUltraLightColor } from "@/lib/colors";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  primaryColor: string;
  themeColor: string | null;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setPrimaryColor: (color: string) => void;
  setThemeColor: (color: string | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getContrastColor(hex: string) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [primaryColor, setPrimaryColorState] = useState<string>("#0C1C33");
  const [themeColor, setThemeColorState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedTheme = localStorage.getItem("sejoura-theme") as Theme | null;
    const storedColor = localStorage.getItem("sejoura-primary-color");
    // Persistance : on lit d'abord la clé demandée "theme_color", puis l'ancienne clé pour rétro-compatibilité
    const storedThemeColor =
      localStorage.getItem("theme_color") ||
      localStorage.getItem("sejoura-theme-color");

    if (storedTheme) {
      setThemeState(storedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setThemeState("dark");
    }

    if (storedColor) {
      setPrimaryColorState(storedColor);
    }

    if (storedThemeColor) {
      setThemeColorState(storedThemeColor);
      const preset = getThemePresetById(storedThemeColor);
      document.documentElement.style.setProperty("--sidebar-bg", preset.sidebarBg);
      document.documentElement.style.setProperty("--main-bg", preset.contentBg);
      document.documentElement.style.setProperty("--primary-color", preset.sidebarBg);
      document.documentElement.style.setProperty("--primary-light", preset.contentBg);
    }
  }, []);


  useEffect(() => {
    function handleThemeColorUpdated(e: Event) {
      const colorOrId = (e as CustomEvent<{ themeColor: string }>).detail?.themeColor;
      if (colorOrId) {
        setThemeColorState(colorOrId);
        localStorage.setItem("theme_color", colorOrId);
        localStorage.setItem("sejoura-theme-color", colorOrId);
      }
    }

    window.addEventListener("sejoura-theme-color-updated", handleThemeColorUpdated);
    return () => {
      window.removeEventListener("sejoura-theme-color-updated", handleThemeColorUpdated);
    };
  }, []);

  useEffect(() => {
    if (mounted) {
      const root = document.documentElement;
      if (theme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      const contrast = getContrastColor(primaryColor);
      root.style.setProperty("--color-primary", primaryColor);
      root.style.setProperty("--primary", primaryColor);
      root.style.setProperty("--color-primary-foreground", contrast);
      root.style.setProperty("--primary-foreground", contrast);
      
      if (themeColor) {
        const isCustomHex = themeColor.startsWith("#") &&
          themeColor.trim().length === 7 &&
          !THEME_PRESETS.some((p) => p.sidebarBg.toLowerCase() === themeColor!.trim().toLowerCase());
        const sidebarBg = isCustomHex ? themeColor.trim() : getThemePresetById(themeColor).sidebarBg;
        const contentBg = isCustomHex ? deriveUltraLightColor(sidebarBg) : getThemePresetById(themeColor).contentBg;
        root.style.setProperty("--sidebar-bg", sidebarBg);
        root.style.setProperty("--main-bg", theme === "dark" ? "#090D16" : contentBg);
        root.style.setProperty("--primary-color", sidebarBg);
        root.style.setProperty("--primary-light", contentBg);
        localStorage.setItem("theme_color", themeColor);
        localStorage.setItem("sejoura-theme-color", themeColor);
      }

      localStorage.setItem("sejoura-theme", theme);
      localStorage.setItem("sejoura-primary-color", primaryColor);
    }
  }, [theme, primaryColor, themeColor, mounted]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const setPrimaryColor = (color: string) => {
    setPrimaryColorState(color);
  };

  const setThemeColor = (color: string | null) => {
    setThemeColorState(color);
    if (color) {
      localStorage.setItem("theme_color", color);
      localStorage.setItem("sejoura-theme-color", color);
    } else {
      localStorage.removeItem("theme_color");
      localStorage.removeItem("sejoura-theme-color");
    }
  };


  return (
    <ThemeContext.Provider value={{ theme, primaryColor, themeColor, toggleTheme, setTheme, setPrimaryColor, setThemeColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme doit être utilisé dans un ThemeProvider");
  }
  return context;
}
