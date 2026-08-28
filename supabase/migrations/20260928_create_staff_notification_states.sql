-- Table de suivi des notifications pour les réservations en ligne
CREATE TABLE IF NOT EXISTS staff_notification_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_notification_states_tenant_user 
  ON staff_notification_states(tenant_id, user_id);

COMMENT ON TABLE staff_notification_states IS 'Suit la dernière consultation des réservations en ligne par utilisateur';
COMMENT ON COLUMN staff_notification_states.last_viewed_at IS 'Date de dernière consultation du dashboard réservations';
