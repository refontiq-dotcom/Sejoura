// ──────────────────────────────────────────────────────────────────────────────
// Éligibilité Trouvetou — source unique de la règle métier partagée entre :
//   • la vitrine (GET /api/v1/trouvetou/listings)  : quels types afficher ;
//   • la sync (src/lib/trouvetou/sync.ts)          : quels types pousser.
//
// Un type de chambre est « éligible » s'il remplit TOUTES les conditions :
//   • l'établissement est actif (accommodations.is_active = true) ;
//   • l'abonnement du tenant est `active` (subscriptions.status = 'active') ;
//   • le type possède au moins une photo (featured_images non vide) ;
//   • le type possède au moins une chambre.
//
// NB : l'interrupteur is_listed_on_trouvetou n'est PAS un critère ici — dans la
// vitrine il distingue « En ligne » / « Masqué » (un type éligible masqué reste
// visible pour pouvoir être réactivé) ; dans la sync il est filtré côté requête.
// ──────────────────────────────────────────────────────────────────────────────

export interface TrouvetouEligibilityInput {
  accommodationActive: boolean;
  subscriptionActive: boolean;
  hasPhoto: boolean;
  hasRoom: boolean;
}

export function isTrouvetouEligible(input: TrouvetouEligibilityInput): boolean {
  return (
    input.accommodationActive &&
    input.subscriptionActive &&
    input.hasPhoto &&
    input.hasRoom
  );
}
