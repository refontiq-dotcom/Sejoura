-- ----------------------------------------------------------------------------
-- Trouvetou : publication gratuite pour tous les forfaits
-- ----------------------------------------------------------------------------
-- La visibilité d'une annonce Trouvetou ne dépend plus du forfait ni du statut
-- d'abonnement. On neutralise donc la coupure automatique des interrupteurs
-- `room_types.is_listed_on_trouvetou` à l'expiration / au verrouillage d'un
-- abonnement, qui pénalisait notamment le plan `free` à la fin de l'essai.
--
-- La fonction et le trigger conservent leur nom (compatibilité diagnostic /
-- tests). Seule la visibilité en tête de liste (Boost) reste liée au forfait.

CREATE OR REPLACE FUNCTION trouvetou_cut_on_subscription_expiry()
RETURNS TRIGGER AS $$
BEGIN
  -- Publication Trouvetou gratuite et indépendante de l'abonnement :
  -- on ne coupe plus les interrupteurs de visibilité.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN room_types.is_listed_on_trouvetou IS
  'Visibilité de l''annonce sur Trouvetou. Publication gratuite pour tous les forfaits (dont free) — indépendante de l''abonnement.';
