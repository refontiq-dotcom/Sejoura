/**
  * Utilitaire de calcul de contraste & luminance WCAG pour le thème dynamique Séjoura
  */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) {
    return { r: 12, g: 28, b: 51 }; // Fallback Bleu profond #0C1C33
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Calcule la luminance relative selon la formule WCAG 2.1
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [sR, sG, sB] = [r, g, b].map((val) => {
    const v = val / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

/**
 * Détermine si la couleur est sombre (retourne true pour texte blanc, false pour texte sombre)
 */
export function isDarkColor(hexColor?: string | null): boolean {
  if (!hexColor || hexColor.trim() === "") return true; // Par défaut #0C1C33 est sombre
  const { r, g, b } = hexToRgb(hexColor);
  const luminance = getRelativeLuminance(r, g, b);
  return luminance < 0.45;
}

/**
 * Calcule une nuance pastel ultra-claire (opacité ~5% à 8% ou haute luminance)
 * à partir de n'importe quelle couleur hexadécimale de thème (--sidebar-bg).
 * Ex: #1E3A8A -> #F2F3F8, #0C1C33 -> #F0F1F3, #064E3B -> #F0F4F3, #7C3AED -> #F7F3FE
 */
export function deriveUltraLightColor(hexColor?: string | null): string {
  const hex = hexColor && hexColor.trim() !== "" ? hexColor : "#0C1C33";
  const { r, g, b } = hexToRgb(hex);

  const dark = isDarkColor(hex);

  if (dark) {
    // Teinte pastel très claire basée sur la couleur du sidebar (6% couleur + 94% fond #F4F6FC)
    const rPastel = Math.round(r * 0.05 + 244 * 0.95);
    const gPastel = Math.round(g * 0.05 + 246 * 0.95);
    const bPastel = Math.round(b * 0.05 + 252 * 0.95);
    return `#${rPastel.toString(16).padStart(2, "0")}${gPastel.toString(16).padStart(2, "0")}${bPastel.toString(16).padStart(2, "0")}`;
  } else {
    return "#F4F6FC";
  }
}

/**
 * Calcule une nuance pastel claire bien visible (30% de la couleur + 70% blanc)
 * à partir de n'importe quelle couleur hexadécimale.
 * Ex: #0C1C33 -> #B6BBC2, #2563EB -> #BDD0F7, #9D174D -> #E2BACB
 */
export function derivePastelColor(hexColor?: string | null): string {
  const hex = hexColor && hexColor.trim() !== "" ? hexColor : "#0C1C33";
  const { r, g, b } = hexToRgb(hex);
  const rPastel = Math.round(r * 0.3 + 255 * 0.7);
  const gPastel = Math.round(g * 0.3 + 255 * 0.7);
  const bPastel = Math.round(b * 0.3 + 255 * 0.7);
  return `#${rPastel.toString(16).padStart(2, "0")}${gPastel.toString(16).padStart(2, "0")}${bPastel.toString(16).padStart(2, "0")}`;
}

/**
 * Calcule une nuance de survol (hover) basée sur la couleur principale choisie
 */
export function deriveHoverColor(hexColor?: string | null): string {
  const defaultBg = "#0C1C33";
  const hex = hexColor && hexColor.trim() !== "" ? hexColor : defaultBg;
  const { r, g, b } = hexToRgb(hex);

  const rHover = Math.min(255, Math.round(r * 0.88 + 255 * 0.12));
  const gHover = Math.min(255, Math.round(g * 0.88 + 255 * 0.12));
  const bHover = Math.min(255, Math.round(b * 0.88 + 255 * 0.12));
  return `#${rHover.toString(16).padStart(2, "0")}${gHover.toString(16).padStart(2, "0")}${bHover.toString(16).padStart(2, "0")}`;
}

export interface ThemePreset {
  id: string;
  name: string;
  sidebarBg: string; // Couleur du Sidebar (Foncé)
  contentBg: string; // Couleur du fond de contenu (Clair / Pastel)
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "blue",
    name: "Bleu",
    sidebarBg: "#0F172A",
    contentBg: "#E0F2FE",
  },
  {
    id: "green",
    name: "Vert",
    sidebarBg: "#064E3B",
    contentBg: "#DCFCE7",
  },
  {
    id: "purple",
    name: "Violet",
    sidebarBg: "#3B0764",
    contentBg: "#F3E8FF",
  },
  {
    id: "amber",
    name: "Ambre / Marron",
    sidebarBg: "#451A03",
    contentBg: "#FEF3C7",
  },
  {
    id: "red",
    name: "Rouge / Rose",
    sidebarBg: "#881337",
    contentBg: "#FFE4E6",
  },
  {
    id: "teal",
    name: "Teal / Bleu-Vert",
    sidebarBg: "#134E4A",
    contentBg: "#CCFBF1",
  },
  {
    id: "slate",
    name: "Gris / Ardoise",
    sidebarBg: "#111827",
    contentBg: "#E2E8F0",
  },
];

export const DEFAULT_THEME_PRESET = THEME_PRESETS[0];

export function getThemePresetById(idOrColor?: string | null): ThemePreset {
  if (!idOrColor) return DEFAULT_THEME_PRESET;
  const clean = idOrColor.trim();
  // Matching par ID
  const foundById = THEME_PRESETS.find((p) => p.id === clean.toLowerCase());
  if (foundById) return foundById;
  // Matching par couleur de sidebar pour rétro-compatibilité (hex)
  const foundByColor = THEME_PRESETS.find(
    (p) => p.sidebarBg.toLowerCase() === clean.toLowerCase()
  );
  if (foundByColor) return foundByColor;

  return DEFAULT_THEME_PRESET;
}

export interface SidebarTheme {
  presetId: string;
  sidebarBg: string;      // --sidebar-bg / --primary-color
  mainBg: string;         // --main-bg / --primary-light
  hoverBg: string;        // --primary-hover
  textColor: string;      // Texte/icônes inactifs (#FFFFFF)
  mutedTextColor: string; // Texte/icônes inactifs secondaires (#E2E8F0)
  accentColor: string;    // Accentuation Or Séjoura (#C2944E)
  activeBg: string;       // Fond de l'onglet actif = --main-bg (contentBg)
  activeTextColor: string;// Texte/icônes actifs = --sidebar-bg
  borderColor: string;
  cardBg: string;         // Fond des cartes = #FFFFFF en Mode Clair, #131C2E en Mode Sombre
  cardBorder: string;     // Bordure des cartes = border-slate-200 en Mode Clair, #1E293B en Mode Sombre
  isDark: boolean;
}

/**
 * Constantes du mode sombre — Noir/Anthracite ultra-reposant
 */
export const DARK_MODE_BG = "#090D16";      // Fond de page principal
export const DARK_MODE_CARD = "#131C2E";    // Cartes & conteneurs secondaires
export const DARK_MODE_BORDER = "#1E293B";  // Bordures sombres subtiles

/**
 * Génère les styles d'interface du Sidebar & Dashboard en fonction du thème sélectionné
 * @param themeIdOrColor ID du preset (ex: 'green') ou couleur hex de sidebar
 * @param isDarkMode Si true, applique le mode sombre
 */
export function getSidebarThemeStyles(themeIdOrColor?: string | null, isDarkMode: boolean = false): SidebarTheme {
  const preset = getThemePresetById(themeIdOrColor);
  const isCustomHex = !!themeIdOrColor && themeIdOrColor.startsWith("#") &&
    themeIdOrColor.trim().length === 7 &&
    !THEME_PRESETS.some((p) => p.sidebarBg.toLowerCase() === themeIdOrColor.trim().toLowerCase());
  const sidebarBg = isCustomHex ? themeIdOrColor.trim() : preset.sidebarBg;
  const contentBg = isCustomHex ? deriveUltraLightColor(sidebarBg) : preset.contentBg;
  const hoverBg = deriveHoverColor(sidebarBg);

  if (isDarkMode) {
    return {
      presetId: preset.id,
      sidebarBg,
      mainBg: DARK_MODE_BG,
      hoverBg,
      textColor: "#FFFFFF",
      mutedTextColor: "#94A3B8",
      accentColor: "#C2944E",
      activeBg: DARK_MODE_BG,
      activeTextColor: "#FFFFFF",
      borderColor: "rgba(255, 255, 255, 0.12)",
      cardBg: DARK_MODE_CARD,
      cardBorder: DARK_MODE_BORDER,
      isDark: true,
    };
  }

  return {
    presetId: preset.id,
    sidebarBg,
    mainBg: contentBg,
    hoverBg,
    textColor: "#FFFFFF",
    mutedTextColor: "#E2E8F0",
    accentColor: "#C2944E",
    activeBg: contentBg,
    activeTextColor: sidebarBg,
    borderColor: "rgba(255, 255, 255, 0.12)",
    cardBg: "#FFFFFF",
    cardBorder: "#E2E8F0",
    isDark: false,
  };
}

