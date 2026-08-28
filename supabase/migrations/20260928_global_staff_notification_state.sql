-- ============================================================================
-- Migration : compteur GLOBAL des réservations en ligne
-- ============================================================================
-- Le badge "Réservations" du sidebar est partagé entre tous les employés du
-- tenant : dès qu'un employé consulte le module Réservations, le compteur
-- repart à zéro pour toute l'équipe.
--
-- Passe staff_notification_states d'un suivi PAR UTILISATEUR
-- (UNIQUE tenant_id, user_id) vers un suivi PAR TENANT (UNIQUE tenant_id) :
--   - une seule ligne par tenant (dernière consultation globale)
--   - user_id devient inutile et est supprimé (colonne + FK + index)
--   - RLS activée avec politiques cohérentes au reste du schéma
--
-- Migration IDEMPOTENTE : exécutable à l'identique quel que soit l'état
-- de départ (table absente, table par-utilisateur, ou table déjà globale).
-- ============================================================================

-- 1. Créer la table si elle n'existe pas (structure GLOBALE, sans user_id)
CREATE TABLE IF NOT EXISTS staff_notification_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Dédupliquer : ne garder que la consultation la plus récente par tenant
--    (sécurité : la table a pu contenir une ligne par employé avant cette migration)
--    Le tiebreaker sur id garantit qu'il ne reste qu'UNE ligne même en cas
--    de last_viewed_at identiques (sinon l'unicité par tenant échouerait).
DELETE FROM staff_notification_states a
USING staff_notification_states b
WHERE a.tenant_id = b.tenant_id
  AND (a.last_viewed_at < b.last_viewed_at
       OR (a.last_viewed_at = b.last_viewed_at AND a.id < b.id));

-- 3. Retirer l'ancienne contrainte d'unicité par utilisateur (si présente)
ALTER TABLE staff_notification_states
  DROP CONSTRAINT IF EXISTS staff_notification_states_tenant_id_user_id_key;

-- 4. user_id ne sert plus : suppression de la colonne si elle existe
--    (emporte la FK implicite vers users ; aucun IF manquant possible)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'staff_notification_states'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE staff_notification_states DROP COLUMN user_id;
  END IF;
END $$;

-- 5. Une seule ligne par tenant (contrainte UNIQUE créée si absente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_notification_states_tenant_id_key'
      AND conrelid = 'staff_notification_states'::regclass
  ) THEN
    ALTER TABLE staff_notification_states
      ADD CONSTRAINT staff_notification_states_tenant_id_key UNIQUE (tenant_id);
  END IF;
END $$;

-- 6. Index adapté au nouveau mode global
DROP INDEX IF EXISTS idx_staff_notification_states_tenant_user;
CREATE INDEX IF NOT EXISTS idx_staff_notification_states_tenant
  ON staff_notification_states(tenant_id);

-- 7. RLS : chaque tenant ne voit/écrit que sa propre ligne.
--    DROP puis CREATE pour être rejouable sans erreur.
ALTER TABLE staff_notification_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_notification_states_select_own" ON staff_notification_states;
CREATE POLICY "staff_notification_states_select_own" ON staff_notification_states
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "staff_notification_states_insert_own" ON staff_notification_states;
CREATE POLICY "staff_notification_states_insert_own" ON staff_notification_states
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

DROP POLICY IF EXISTS "staff_notification_states_update_own" ON staff_notification_states;
CREATE POLICY "staff_notification_states_update_own" ON staff_notification_states
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

COMMENT ON TABLE staff_notification_states IS 'Suit la dernière consultation GLOBALE des réservations en ligne par tenant (partagée entre tous les employés)';
COMMENT ON COLUMN staff_notification_states.last_viewed_at IS 'Date de dernière consultation globale du dashboard réservations (partagée entre les employés)';
