export type SubscriptionTier = "essentiel" | "entreprise" | "free";

// Liens de paiement Wave (paiement semi-automatisé) pour chaque formule
export const WAVE_PAY_LINKS: Record<string, string> = {
  essentiel: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=15000",
  entreprise: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=55000",
  standard: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=15000",
  enterprise: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=55000",
};

export function getWavePayLink(plan?: string | null): string {
  return WAVE_PAY_LINKS[normalizePlan(plan ?? "free")] ?? "";
}

export function normalizePlan(plan?: string | null): SubscriptionTier {
  const normalized = (plan || "").toLowerCase();
  if (normalized === "essentiel" || normalized === "essential" || normalized === "standard") return "essentiel";
  if (normalized === "entreprise" || normalized === "enterprise") return "entreprise";
  return "free";
}

export function getPlanPrice(plan?: string | null): number {
  switch (normalizePlan(plan)) {
    case "entreprise":
      return 55000;
    case "essentiel":
      return 15000;
    default:
      return 0;
  }
}

export function canAccessFeature(feature: string, plan?: string | null): boolean {
  const normalized = normalizePlan(plan);
  switch (feature) {
    case "advancedAccounting":
    case "externalApi":
    case "trouvetouBoost":
    case "customRoles":
    case "clientPortal":
      return normalized === "entreprise";
    case "cleaningModule":
    case "advancedStats":
    case "multiResidences":
      return normalized === "entreprise";
    default:
      return normalized === "entreprise" || normalized === "essentiel";
  }
}

export function getPlanLimits(plan?: string | null) {
  const normalized = normalizePlan(plan);
  if (normalized === "entreprise") {
    return {
      maxAccommodations: null,
      maxUnits: null,
      maxUsers: null,
      maxSystemAccounts: null,
      hasAdvancedAccounting: true,
      hasTrouvetouBoost: true,
      hasExternalApi: true,
      hasCustomRoles: true,
    };
  }

  // Plan Free (essai 1 mois) et Essentiel
  return {
    maxAccommodations: 1,
    maxUnits: 10,
    maxUsers: 2,
    maxSystemAccounts: 2,
    hasAdvancedAccounting: false,
    hasTrouvetouBoost: false,
    hasExternalApi: false,
    hasCustomRoles: false,
  };
}
