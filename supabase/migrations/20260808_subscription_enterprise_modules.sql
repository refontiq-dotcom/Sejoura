-- 20260808_subscription_enterprise_modules.sql
-- Extend subscription plans and add Enterprise-only modules support

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
    CREATE TYPE subscription_plan AS ENUM ('standard', 'enterprise', 'free');
  END IF;
END $$;

ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'essentiel';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'entreprise';

ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS is_boosted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boost_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS external_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['availability','bookings'],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_api_keys_tenant_id ON external_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_external_api_keys_active ON external_api_keys(is_active);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_external_api_keys_updated ON external_api_keys;
CREATE TRIGGER trigger_external_api_keys_updated
BEFORE UPDATE ON external_api_keys
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
