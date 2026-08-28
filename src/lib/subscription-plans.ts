export type SubscriptionTier = "essentiel" | "croissance" | "entreprise" | "free";

// Liens de paiement Wave (paiement semi-automatisé) pour chaque formule
export const WAVE_PAY_LINKS: Record<string, string> = {
  essentiel: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=9900",
  croissance: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=24900",
  entreprise: "https://pay.wave.com/m/M_ci_RImDyQYI8ccj/c/ci/?amount=54900",
};

export function getWavePayLink(plan?: string | null): string {
  return WAVE_PAY_LINKS[normalizePlan(plan ?? "free")] ?? "";
}

export function normalizePlan(plan?: string | null): SubscriptionTier {
  const normalized = (plan || "").toLowerCase();
  if (normalized === "essentiel" || normalized === "essential" || normalized === "standard") return "essentiel";
  if (normalized === "croissance" || normalized === "growth" || normalized === "pro") return "croissance";
  if (normalized === "entreprise" || normalized === "enterprise") return "entreprise";
  return "free";
}

export function getPlanPrice(plan?: string | null): number {
  switch (normalizePlan(plan)) {
    case "entreprise":
      return 54900;
    case "croissance":
      return 24900;
    case "essentiel":
      return 9900;
    default:
      return 0;
  }
}

// Prix annuel = 10 mois facturés (2 mois offerts), arrondi à la centaine.
export function getPlanAnnualPrice(plan?: string | null): number {
  const monthly = getPlanPrice(plan);
  return monthly > 0 ? monthly * 10 : 0;
}

export function canAccessFeature(feature: string, plan?: string | null): boolean {
  const normalized = normalizePlan(plan);
  switch (feature) {
    // Réservées à l'Entreprise
    case "externalApi":
    case "customRoles":
    case "clientSmartProfile":
    case "advancedStats":
    case "multiResidences":
    case "advancedAccounting": // comptabilité complète (bénéfice net, audit)
    case "trouvetouBoost": // boost permanent — reste exclusif Entreprise
      return normalized === "entreprise";
    // Débloquées dès la Croissance
    case "cleaningModule":
    case "basicAccounting": // factures + export, sans audit/bénéfice net
    case "clientPortal": // en lecture seule sur Croissance, complet sur Entreprise
      return normalized === "croissance" || normalized === "entreprise";
    default:
      return normalized === "entreprise" || normalized === "croissance" || normalized === "essentiel";
  }
}

// Le portail client existe dès la Croissance, mais en version limitée
// (consultation seule) ; la version complète (demandes de service) est
// réservée à l'Entreprise.
export function getClientPortalMode(plan?: string | null): "none" | "readonly" | "full" {
  const normalized = normalizePlan(plan);
  if (normalized === "entreprise") return "full";
  if (normalized === "croissance") return "readonly";
  return "none";
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

  if (normalized === "croissance") {
    return {
      maxAccommodations: 1,
      maxUnits: 35,
      maxUsers: 5,
      maxSystemAccounts: 5,
      hasAdvancedAccounting: false,
      hasTrouvetouBoost: false,
      hasExternalApi: false,
      hasCustomRoles: false,
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
