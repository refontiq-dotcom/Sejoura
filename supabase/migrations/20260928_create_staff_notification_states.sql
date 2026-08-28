-- Table de suivi de la consultation des réservations en ligne.
-- Structure GLOBALE (par tenant) : une seule ligne par tenant, partagée entre
-- tous les employés.
--
-- Note : la contrainte UNIQUE est définie DANS le CREATE TABLE, donc elle n'est
-- appliquée que si la table est réellement créée. Si la table existe déjà
-- (ancien format par-utilisateur), c'est la migration
-- 20260928_global_staff_notification_state.sql qui gère la migration d'état
-- (déduplication, suppression de user_id, ajout de la contrainte).
CREATE TABLE IF NOT EXISTS staff_notification_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_notification_states_tenant_id_key UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_notification_states_tenant
  ON staff_notification_states(tenant_id);

COMMENT ON TABLE staff_notification_states IS 'Suit la dernière consultation GLOBALE des réservations en ligne par tenant (partagée entre tous les employés)';
COMMENT ON COLUMN staff_notification_states.last_viewed_at IS 'Date de dernière consultation globale du dashboard réservations (partagée entre les employés)';
