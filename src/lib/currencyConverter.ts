/**
 * ============================================================================
 * SÉJOURA — CONVERTISSEUR DE DEVISES (AVEC TAUX DYNAMIQUES)
 * ============================================================================
 *
 * - Fonctions synchrones (convertXofTo, formatPrice) : taux statiques (fallback instantané)
 * - Fonctions asynchrones (convertXofToDynamic, formatPriceDynamic) : taux dynamiques via Frankfurter API
 *
 * API : https://frankfurter.app (gratuite, pas de clé requise, données ECB)
 */

export interface CurrencyRate {
  code: string;
  symbol: string;
  rateToXof: number;
  decimals: number;
}

export const BASE_CURRENCY = "XOF";

// Taux statiques de fallback
const FALLBACK_RATES: Record<string, number> = {
  XOF: 1,
  XAF: 1,
  NGN: 0.0089,
  GHS: 0.051,
  GNF: 0.00011,
  CDF: 0.00065,
  MAD: 0.16,
  TND: 0.41,
  DZD: 0.076,
  EGP: 0.033,
  KES: 0.0078,
  TZS: 0.00043,
  UGX: 0.00028,
  RWF: 0.00078,
  ETB: 0.0083,
  ZAR: 0.14,
  MGA: 0.00028,
  MUR: 0.027,
  USD: 0.0016,
  EUR: 0.0015,
};

const CURRENCY_META: Record<string, { symbol: string; decimals: number }> = {
  XOF: { symbol: "FCFA", decimals: 0 },
  XAF: { symbol: "FCFA", decimals: 0 },
  NGN: { symbol: "₦", decimals: 2 },
  GHS: { symbol: "₵", decimals: 2 },
  GNF: { symbol: "FG", decimals: 0 },
  CDF: { symbol: "FC", decimals: 2 },
  MAD: { symbol: "DH", decimals: 2 },
  TND: { symbol: "DT", decimals: 2 },
  DZD: { symbol: "DA", decimals: 2 },
  EGP: { symbol: "E£", decimals: 2 },
  KES: { symbol: "KSh", decimals: 2 },
  TZS: { symbol: "TSh", decimals: 2 },
  UGX: { symbol: "USh", decimals: 2 },
  RWF: { symbol: "FRw", decimals: 2 },
  ETB: { symbol: "Br", decimals: 2 },
  ZAR: { symbol: "R", decimals: 2 },
  MGA: { symbol: "Ar", decimals: 0 },
  MUR: { symbol: "Rs", decimals: 2 },
  USD: { symbol: "$", decimals: 2 },
  EUR: { symbol: "€", decimals: 2 },
};

// Cache des taux dynamiques
let dynamicRates: Record<string, number> | null = null;
let lastFetchTime = 0;
const RATE_CACHE_TTL = 1000 * 60 * 60; // 1 heure

/**
 * Récupère les taux dynamiques depuis Frankfurter API (EUR → XOF conversion).
 */
async function fetchDynamicRates(): Promise<Record<string, number> | null> {
  try {
    const codes = Object.keys(FALLBACK_RATES).filter((c) => c !== "XOF" && c !== "XAF");
    const url = `https://api.frankfurter.app/latest?from=EUR&to=${codes.join(",")}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.rates) return null;

    const EUR_TO_XOF = 655.957;
    const rates: Record<string, number> = { XOF: 1, XAF: 1 };

    for (const [code, eurRate] of Object.entries(data.rates)) {
      if (typeof eurRate === "number") {
        rates[code] = EUR_TO_XOF / eurRate;
      }
    }

    return rates;
  } catch {
    return null;
  }
}

/**
 * Récupère le taux dynamique pour une devise (avec cache 1h).
 */
async function getDynamicRate(code: string): Promise<number> {
  const now = Date.now();
  if (!dynamicRates || now - lastFetchTime > RATE_CACHE_TTL) {
    const fetched = await fetchDynamicRates();
    if (fetched) {
      dynamicRates = fetched;
      lastFetchTime = now;
    }
  }
  if (dynamicRates && code in dynamicRates) return dynamicRates[code];
  return FALLBACK_RATES[code] ?? 1;
}

// ─── FONCTIONS SYNCHRONES (fallback statique, pas d'await) ─────────────────

export function getRate(code: string): number {
  const entry = FALLBACK_RATES[code];
  if (entry === undefined) throw new Error(`Devise non supportée: ${code}`);
  return entry;
}

export function convertXofTo(amountInXof: number, targetCode: string): number {
  if (targetCode === BASE_CURRENCY) return amountInXof;
  return amountInXof * getRate(targetCode);
}

export function convertToXof(amountInTarget: number, sourceCode: string): number {
  if (sourceCode === BASE_CURRENCY) return amountInTarget;
  return amountInTarget / getRate(sourceCode);
}

export function getCurrencySymbol(code: string): string {
  return CURRENCY_META[code]?.symbol ?? code;
}

export function getCurrencyDecimals(code: string): number {
  return CURRENCY_META[code]?.decimals ?? 2;
}

export function formatPrice(amountInXof: number, targetCode: string): string {
  const converted = convertXofTo(amountInXof, targetCode);
  const decimals = getCurrencyDecimals(targetCode);
  const symbol = getCurrencySymbol(targetCode);
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(converted || 0);

  if (["$", "₦", "₵", "£", "€"].includes(symbol.trim())) {
    return `${symbol} ${formatted}`;
  }
  return `${formatted} ${symbol}`;
}

// ─── FONCTIONS ASYNCHRONES (taux dynamiques via API) ───────────────────────

export async function convertXofToDynamic(amountInXof: number, targetCode: string): Promise<number> {
  if (targetCode === BASE_CURRENCY) return amountInXof;
  const rate = await getDynamicRate(targetCode);
  return amountInXof * rate;
}

export async function convertToXofDynamic(amountInTarget: number, sourceCode: string): Promise<number> {
  if (sourceCode === BASE_CURRENCY) return amountInTarget;
  const rate = await getDynamicRate(sourceCode);
  return amountInTarget / rate;
}

export async function formatPriceDynamic(amountInXof: number, targetCode: string): Promise<string> {
  const converted = await convertXofToDynamic(amountInXof, targetCode);
  const decimals = getCurrencyDecimals(targetCode);
  const symbol = getCurrencySymbol(targetCode);
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(converted || 0);

  if (["$", "₦", "₵", "£", "€"].includes(symbol.trim())) {
    return `${symbol} ${formatted}`;
  }
  return `${formatted} ${symbol}`;
}
