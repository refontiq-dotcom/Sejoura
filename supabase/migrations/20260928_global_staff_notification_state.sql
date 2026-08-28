-- ============================================================================
-- Migration : compteur GLOBAL des réservations en ligne
-- ============================================================================
-- Le badge "Réservations" du sidebar est partagé entre tous les employés du
-- tenant : dès qu'un employé consulte le module Réservations, le compteur
-- repart à zéro pour toute l'équipe.
--
-- Transforme staff_notification_states d'un suivi PAR UTILISATEUR
-- (UNIQUE tenant_id, user_id) vers un suivi PAR TENANT (UNIQUE tenant_id) :
--   - une seule ligne par tenant (dernière consultation globale)
--   - user_id devient inutile et est supprimé (colonne + FK + index)
--   - RLS activée avec politiques cohérentes au reste du schéma
-- ============================================================================

-- 1. Dédupliquer : ne garder que la consultation la plus récente par tenant
--    (sécurité : la table a pu contenir une ligne par employé avant cette migration)
--    Le tiebreaker sur id garantit qu'il ne reste qu'UNE ligne même en cas
--    de last_viewed_at identiques (sinon la contrainte UNIQUE(tenant_id) échouerait).
DELETE FROM staff_notification_states a
USING staff_notification_states b
WHERE a.tenant_id = b.tenant_id
  AND (a.last_viewed_at < b.last_viewed_at
       OR (a.last_viewed_at = b.last_viewed_at AND a.id < b.id));

-- 2. Retirer la contrainte d'unicité par utilisateur
ALTER TABLE staff_notification_states
  DROP CONSTRAINT IF EXISTS staff_notification_states_tenant_id_user_id_key;

-- 3. user_id ne sert plus (suppression colonne + FK implicite)
ALTER TABLE staff_notification_states
  DROP COLUMN IF EXISTS user_id;

-- 4. Une seule ligne par tenant
ALTER TABLE staff_notification_states
  ADD CONSTRAINT staff_notification_states_tenant_id_key UNIQUE (tenant_id);

-- 5. Index adapté au nouveau mode global
DROP INDEX IF EXISTS idx_staff_notification_states_tenant_user;
CREATE INDEX IF NOT EXISTS idx_staff_notification_states_tenant
  ON staff_notification_states(tenant_id);

-- 6. RLS : chaque tenant ne voit/écrit que sa propre ligne
ALTER TABLE staff_notification_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_notification_states_select_own" ON staff_notification_states
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "staff_notification_states_insert_own" ON staff_notification_states
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "staff_notification_states_update_own" ON staff_notification_states
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

COMMENT ON TABLE staff_notification_states IS 'Suit la dernière consultation GLOBALE des réservations en ligne par tenant (partagée entre tous les employés)';
COMMENT ON COLUMN staff_notification_states.last_viewed_at IS 'Date de dernière consultation globale du dashboard réservations (partagée entre les employés)';
