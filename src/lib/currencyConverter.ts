export interface CurrencyRate {
  code: string;
  symbol: string;
  rateToXof: number;
  decimals: number;
}

export const BASE_CURRENCY = "XOF";

export const CURRENCY_RATES: CurrencyRate[] = [
  { code: "XOF", symbol: "FCFA", rateToXof: 1, decimals: 0 },
  { code: "XAF", symbol: "FCFA", rateToXof: 1, decimals: 0 },
  { code: "NGN", symbol: "₦", rateToXof: 0.0089, decimals: 2 },
  { code: "GHS", symbol: "₵", rateToXof: 0.051, decimals: 2 },
  { code: "GNF", symbol: "FG", rateToXof: 0.00011, decimals: 0 },
  { code: "CDF", symbol: "FC", rateToXof: 0.00065, decimals: 2 },
  { code: "MAD", symbol: "DH", rateToXof: 0.16, decimals: 2 },
  { code: "TND", symbol: "DT", rateToXof: 0.41, decimals: 2 },
  { code: "DZD", symbol: "DA", rateToXof: 0.076, decimals: 2 },
  { code: "EGP", symbol: "E£", rateToXof: 0.033, decimals: 2 },
  { code: "KES", symbol: "KSh", rateToXof: 0.0078, decimals: 2 },
  { code: "TZS", symbol: "TSh", rateToXof: 0.00043, decimals: 2 },
  { code: "UGX", symbol: "USh", rateToXof: 0.00028, decimals: 2 },
  { code: "RWF", symbol: "FRw", rateToXof: 0.00078, decimals: 2 },
  { code: "ETB", symbol: "Br", rateToXof: 0.0083, decimals: 2 },
  { code: "ZAR", symbol: "R", rateToXof: 0.14, decimals: 2 },
  { code: "MGA", symbol: "Ar", rateToXof: 0.00028, decimals: 0 },
  { code: "MUR", symbol: "Rs", rateToXof: 0.027, decimals: 2 },
  { code: "USD", symbol: "$", rateToXof: 0.0016, decimals: 2 },
  { code: "EUR", symbol: "€", rateToXof: 0.0015, decimals: 2 },
];

const rateCache = new Map<string, { rate: number; ts: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60;

function getRate(code: string): number {
  const now = Date.now();
  const cached = rateCache.get(code);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.rate;

  const entry = CURRENCY_RATES.find((c) => c.code === code);
  if (!entry) throw new Error(`Devise non supportée: ${code}`);
  rateCache.set(code, { rate: entry.rateToXof, ts: now });
  return entry.rateToXof;
}

export function convertXofTo(amountInXof: number, targetCode: string): number {
  if (targetCode === BASE_CURRENCY) return amountInXof;
  const rate = getRate(targetCode);
  return amountInXof * rate;
}

export function convertToXof(amountInTarget: number, sourceCode: string): number {
  if (sourceCode === BASE_CURRENCY) return amountInTarget;
  const rate = getRate(sourceCode);
  return amountInTarget / rate;
}

export function getCurrencySymbol(code: string): string {
  const entry = CURRENCY_RATES.find((c) => c.code === code);
  return entry ? entry.symbol : code;
}

export function getCurrencyDecimals(code: string): number {
  const entry = CURRENCY_RATES.find((c) => c.code === code);
  return entry ? entry.decimals : 2;
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
