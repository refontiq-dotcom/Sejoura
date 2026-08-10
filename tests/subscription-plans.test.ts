import { normalizePlan, canAccessFeature, getPlanPrice } from "../src/lib/subscription-plans";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

assert(normalizePlan("ESSENTIEL") === "essentiel", "Le plan essentiel doit être normalisé");
assert(normalizePlan("ENTREPRISE") === "entreprise", "Le plan entreprise doit être normalisé");
assert(canAccessFeature("essentiel", "accounting") === false, "Le plan essentiel ne doit pas avoir accès à la compta avancée");
assert(canAccessFeature("entreprise", "externalApi") === true, "Le plan entreprise doit avoir accès à l’API externe");
assert(getPlanPrice("essentiel") === 15000, "Le prix de l’offre essentiel doit être 15000 FCFA");

console.log("subscription plan tests passed");
