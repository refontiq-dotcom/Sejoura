export type AdStatus = "draft" | "pending_payment" | "active" | "expired" | "rejected";

export type AdAudience = "all" | "tourists" | "locals" | "business";

export interface AdDurationOption {
  days: number;
  priceFcfa: number;
  label: string;
  popular: boolean;
}

export const AD_DURATION_OPTIONS: AdDurationOption[] = [
  { days: 3, priceFcfa: 15_000, label: "3 jours", popular: false },
  { days: 7, priceFcfa: 30_000, label: "7 jours", popular: true },
  { days: 14, priceFcfa: 55_000, label: "14 jours", popular: false },
  { days: 30, priceFcfa: 95_000, label: "30 jours", popular: false },
];

const PRICE_BY_DAYS: Record<number, number> = Object.fromEntries(
  AD_DURATION_OPTIONS.map((o) => [o.days, o.priceFcfa])
);

const WAVE_MERCHANT_PATH = "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/";

export const AD_AUDIENCE_OPTIONS: { value: AdAudience; label: string; hint: string }[] = [
  { value: "all", label: "Tous les voyageurs", hint: "Visibilité maximale sur Trouvetou" },
  { value: "tourists", label: "Touristes", hint: "Séjours loisirs et visites" },
  { value: "locals", label: "Clientèle locale", hint: "Court séjour et week-ends" },
  { value: "business", label: "Voyageurs d'affaires", hint: "Déplacements professionnels" },
];

export function getAdCampaignPrice(durationDays: number): number {
  return PRICE_BY_DAYS[durationDays] ?? 0;
}

export function isValidAdDuration(durationDays: number): boolean {
  return durationDays in PRICE_BY_DAYS;
}

export function getAdWavePayLink(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `${WAVE_MERCHANT_PATH}?amount=${Math.round(amount)}`;
}

export function getAdStatusLabel(status: AdStatus, lang: "fr" | "en" = "fr"): string {
  const labels: Record<"fr" | "en", Record<AdStatus, string>> = {
    fr: {
      draft: "Brouillon",
      pending_payment: "En attente de validation",
      active: "Active",
      expired: "Expirée",
      rejected: "Rejetée",
    },
    en: {
      draft: "Draft",
      pending_payment: "Pending validation",
      active: "Active",
      expired: "Expired",
      rejected: "Rejected",
    },
  };
  return labels[lang][status] ?? status;
}

export function getAdAudienceLabel(audience: AdAudience, lang: "fr" | "en" = "fr"): string {
  const labels: Record<"fr" | "en", Record<AdAudience, string>> = {
    fr: {
      all: "Tous les voyageurs",
      tourists: "Touristes",
      locals: "Clientèle locale",
      business: "Voyageurs d'affaires",
    },
    en: {
      all: "All travelers",
      tourists: "Tourists",
      locals: "Local guests",
      business: "Business travelers",
    },
  };
  return labels[lang][audience] ?? audience;
}

export function getRemainingAdDays(endsAt: string | null | undefined): number {
  if (!endsAt) return 0;
  const diff = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
