// ──────────────────────────────────────────────────────────────────────────────
// Éligibilité Trouvetou — source unique de la règle métier partagée entre :
//   • la vitrine (GET /api/v1/trouvetou/listings)  : quels types afficher ;
//   • la sync (src/lib/trouvetou/sync.ts)          : quels types pousser.
//
// Un type de chambre est « éligible » s'il remplit TOUTES les conditions :
//   • l'établissement est actif (accommodations.is_active = true) ;
//   • le type possède au moins une photo (featured_images non vide) ;
//   • le type possède au moins une chambre.
//
// La publication sur Trouvetou est GRATUITE pour tous les forfaits (y compris
// le plan `free`) : aucun critère de plan ni de statut d'abonnement n'entre
// dans l'éligibilité. Seule la visibilité en tête (Boost) reste liée au forfait.
//
// NB : l'interrupteur is_listed_on_trouvetou n'est PAS un critère ici — dans la
// vitrine il distingue « En ligne » / « Masqué » (un type éligible masqué reste
// visible pour pouvoir être réactivé) ; dans la sync il est filtré côté requête.
// ──────────────────────────────────────────────────────────────────────────────

export interface TrouvetouEligibilityInput {
  accommodationActive: boolean;
  hasPhoto: boolean;
  hasRoom: boolean;
}

export function isTrouvetouEligible(input: TrouvetouEligibilityInput): boolean {
  return (
    input.accommodationActive &&
    input.hasPhoto &&
    input.hasRoom
  );
}
