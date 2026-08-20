import { translations, type Lang } from "./translations";

// Helper function to resolve dot-notation paths in an object
function resolvePath(obj: any, path: string): string | undefined {
  return path.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

/**
 * Main translation function with fallback to French.
 * @param lang - Current language ("fr" | "en")
 * @param key - Translation key in dot-notation (e.g., "dashboard.kpis.occupancy")
 * @param params - Optional parameters for interpolation (e.g., { count: 2, city: "Paris" })
 * @returns The translated string, or the French fallback, or the key itself if not found.
 */
export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const currentLangObj = translations[lang] || translations.fr;
  const fallbackLangObj = translations.fr;

  let translation = resolvePath(currentLangObj, key);

  if (translation === undefined && lang !== "fr") {
    // Fallback to French if the key is missing in the current language
    translation = resolvePath(fallbackLangObj, key);
  }

  if (translation === undefined || typeof translation !== "string") {
    // If it's completely missing, return the key
    return key;
  }

  // Interpolate parameters
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      translation = (translation as string).replace(new RegExp(`{${paramKey}}`, "g"), String(paramValue));
    });
  }

  return translation;
}

/**
 * Format a date according to the locale.
 */
export function formatDate(date: Date | string | number, lang: Lang, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = new Date(date);
  return new Intl.DateTimeFormat(lang, options).format(dateObj);
}

/**
 * Format a number according to the locale.
 */
export function formatNumber(value: number, lang: Lang, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(lang, options).format(value);
}

/**
 * Format a currency amount.
 */
export function formatCurrency(amount: number, lang: Lang, currency: string = "XOF", options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency: currency,
    currencyDisplay: "code",
    ...options,
  }).format(amount).replace(currency, currency).trim(); 
}
