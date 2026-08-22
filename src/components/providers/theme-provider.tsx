"use client";

import { getThemePresetById, THEME_PRESETS, derivePastelColor } from "@/lib/colors";
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

function isValidHex(color: string | null | undefined): color is string {
  return Boolean(color && /^#[0-9a-f]{6}$/i.test(color.trim()));
}

/**
 * Calcule la couleur d'accent adaptée au mode sombre.
 * En mode sombre, on utilise la couleur dorée Séjoura (#C2944E) comme couleur primaire
 * pour garantir un contraste suffisant sur fond sombre.
 */
function getDarkModePrimaryColor(sidebarBg: string): string {
  // En mode sombre, la couleur primaire doit être claire pour être visible sur fond sombre
  // On utilise la couleur dorée Séjoura par défaut
  return "#C2944E";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [primaryColor, setPrimaryColorState] = useState<string>("#0C1C33");
  const [themeColor, setThemeColorState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // L'initialisation lit un stockage externe lors de l'hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const storedTheme = localStorage.getItem("sejoura-theme") as Theme | null;
    const storedColor = localStorage.getItem("sejoura-primary-color");
    const storedThemeColor = localStorage.getItem("theme_color");

    if (storedTheme) {
      setThemeState(storedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setThemeState("dark");
    }

    if (isValidHex(storedColor)) {
      setPrimaryColorState(storedColor);
    }

    if (storedThemeColor) {
      setThemeColorState(storedThemeColor);
      const isCustomHex = isValidHex(storedThemeColor) && !THEME_PRESETS.some(
        (preset) => preset.sidebarBg.toLowerCase() === storedThemeColor.toLowerCase()
      );
      const preset = getThemePresetById(storedThemeColor);
      const sidebarBg = isCustomHex ? storedThemeColor : preset.sidebarBg;
      const contentBg = isCustomHex ? derivePastelColor(sidebarBg) : preset.contentBg;
      document.documentElement.style.setProperty("--sidebar-bg", sidebarBg);
      document.documentElement.style.setProperty("--primary-color", sidebarBg);
      // En mode clair, le fond principal de la page Dashboard suit la couleur
      // pastel choisie (nuance dérivée), sinon le pastel du thème.
      const mainBg =
        storedTheme !== "dark" && isValidHex(storedColor)
          ? derivePastelColor(storedColor)
          : storedTheme === "dark"
            ? "#090D16"
            : contentBg;
      document.documentElement.style.setProperty("--main-bg", mainBg);
      document.documentElement.style.setProperty("--primary-light", mainBg);
    }
  }, []);


  useEffect(() => {
    function handleThemeColorUpdated(e: Event) {
      const colorOrId = (e as CustomEvent<{ themeColor: string }>).detail?.themeColor;
      if (colorOrId) {
        setThemeColorState(colorOrId);
        localStorage.setItem("theme_color", colorOrId);
      }
    }

    function handlePrimaryColorUpdated(e: Event) {
      const color = (e as CustomEvent<{ primaryColor: string }>).detail?.primaryColor;
      if (color) {
        setPrimaryColorState(color);
        localStorage.setItem("sejoura-primary-color", color);
      }
    }

    window.addEventListener("sejoura-theme-color-updated", handleThemeColorUpdated);
    window.addEventListener("sejoura-primary-color-updated", handlePrimaryColorUpdated);
    return () => {
      window.removeEventListener("sejoura-theme-color-updated", handleThemeColorUpdated);
      window.removeEventListener("sejoura-primary-color-updated", handlePrimaryColorUpdated);
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
      const safePrimaryColor = isValidHex(primaryColor) ? primaryColor : "#0C1C33";
      const isDark = theme === "dark";
      const dynamicPrimary = isDark ? getDarkModePrimaryColor(safePrimaryColor) : safePrimaryColor;
      const contrast = getContrastColor(dynamicPrimary);
      root.style.setProperty("--color-primary", dynamicPrimary);
      root.style.setProperty("--primary", dynamicPrimary);
      root.style.setProperty("--color-primary-foreground", contrast);
      root.style.setProperty("--primary-foreground", contrast);

      if (themeColor) {
        const isCustomHex = themeColor.startsWith("#") &&
          themeColor.trim().length === 7 &&
          !THEME_PRESETS.some((p) => p.sidebarBg.toLowerCase() === themeColor!.trim().toLowerCase());
        const sidebarBg = isCustomHex ? themeColor.trim() : getThemePresetById(themeColor).sidebarBg;
        const contentBg = isCustomHex ? derivePastelColor(sidebarBg) : getThemePresetById(themeColor).contentBg;

        // En mode sombre, on adapte les couleurs dynamiques :
        // - --primary-color devient la couleur dorée pour être visible sur fond sombre
        // - --primary-light devient le fond sombre de la page
        const isDark = theme === "dark";
        const dynamicPrimary = isDark ? getDarkModePrimaryColor(sidebarBg) : sidebarBg;
        const dynamicLight = isDark
          ? "#090D16"
          : isValidHex(primaryColor)
            ? derivePastelColor(primaryColor)
            : contentBg;

        root.style.setProperty("--sidebar-bg", sidebarBg);
        root.style.setProperty("--main-bg", dynamicLight);
        root.style.setProperty("--primary-color", dynamicPrimary);
        root.style.setProperty("--primary-light", dynamicLight);
        localStorage.setItem("theme_color", themeColor);
      } else {
        root.style.removeProperty("--sidebar-bg");
        root.style.removeProperty("--main-bg");
        root.style.removeProperty("--primary-color");
        root.style.removeProperty("--primary-light");
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
    } else {
      localStorage.removeItem("theme_color");
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
