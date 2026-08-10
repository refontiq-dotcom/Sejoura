export type SubscriptionTier = "essentiel" | "entreprise" | "standard" | "free";

export function normalizePlan(plan?: string | null): SubscriptionTier {
  const normalized = (plan || "").toLowerCase();
  if (normalized === "essentiel" || normalized === "essential") return "essentiel";
  if (normalized === "entreprise" || normalized === "enterprise") return "entreprise";
  if (normalized === "standard") return "standard";
  return "free";
}

export function getPlanPrice(plan?: string | null): number {
  switch (normalizePlan(plan)) {
    case "entreprise":
      return 55000;
    case "essentiel":
      return 15000;
    case "standard":
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
      return normalized === "entreprise";
    case "cleaningModule":
    case "advancedStats":
    case "multiResidences":
      return normalized === "entreprise";
    default:
      return normalized === "entreprise" || normalized === "standard" || normalized === "essentiel";
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

  if (normalized === "essentiel") {
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

  return {
    maxAccommodations: 5,
    maxUnits: 10,
    maxUsers: 2,
    maxSystemAccounts: 2,
    hasAdvancedAccounting: false,
    hasTrouvetouBoost: false,
    hasExternalApi: false,
    hasCustomRoles: false,
  };
}
