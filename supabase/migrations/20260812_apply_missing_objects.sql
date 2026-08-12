-- Migration corrective : objets manquants dans la base distante
-- La base a été initialisée manuellement (aucune migration tracée).
-- Cette migration applique uniquement les objets absents, de manière idempotente.

-- 1. Enums manquants (utilisés par user_preferences et le schéma tenants)
DO $$ BEGIN
  CREATE TYPE user_language AS ENUM ('fr', 'en');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE theme_mode AS ENUM ('light', 'dark');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table user_preferences (20260731_add_branding_language_preferences)
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language user_language NOT NULL DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- 3. Table wave_webhook_events (20260804_add_wave_checkout_webhooks)
CREATE TABLE IF NOT EXISTS wave_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. payments.booking_id nullable (idempotent)
ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL;

-- 5. Trigger protection plan boost permanent (20260808_trouvetou_module)
CREATE OR REPLACE FUNCTION check_permanent_boost_plan()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_permanently_boosted = TRUE THEN
    IF NOT EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.tenant_id = (
        SELECT tenant_id FROM accommodations WHERE id = NEW.id
      )
      AND s.plan IN ('entreprise', 'enterprise')
    ) THEN
      RAISE EXCEPTION
        '[Trouvetou] Boost Permanent réservé au plan Entreprise. accommodation_id: %', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_permanent_boost ON accommodations;
CREATE TRIGGER trigger_check_permanent_boost
  BEFORE UPDATE OF is_permanently_boosted ON accommodations
  FOR EACH ROW
  EXECUTE FUNCTION check_permanent_boost_plan();

-- 6. Bucket invoices public (20260810_invoices_storage_bucket : upload PDF factures + getPublicUrl)
UPDATE storage.buckets SET public = true WHERE id = 'invoices';
