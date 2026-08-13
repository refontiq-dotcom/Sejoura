-- Migration: module Trouvetou / Ma vitrine
-- Date: 2026-08-08

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS is_boosted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boost_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS trouvetou_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  public_title TEXT,
  public_description TEXT,
  featured_images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  amenities_badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  direct_whatsapp TEXT,
  views_count INTEGER NOT NULL DEFAULT 0,
  whatsapp_clicks_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_trouvetou_listings_unit UNIQUE (unit_id)
);

CREATE INDEX IF NOT EXISTS idx_trouvetou_listings_establishment
  ON trouvetou_listings(establishment_id);
CREATE INDEX IF NOT EXISTS idx_trouvetou_listings_published
  ON trouvetou_listings(is_published);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_trouvetou_listings_updated ON trouvetou_listings;
CREATE TRIGGER trigger_trouvetou_listings_updated
BEFORE UPDATE ON trouvetou_listings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE trouvetou_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trouvetou_listings_select_own ON trouvetou_listings;
DROP POLICY IF EXISTS trouvetou_listings_manage_own ON trouvetou_listings;

CREATE POLICY trouvetou_listings_manage_own
  ON trouvetou_listings
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM accommodations a
      JOIN users u ON u.tenant_id = a.tenant_id
      WHERE u.auth_user_id = auth.uid()
        AND a.id = trouvetou_listings.establishment_id
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM accommodations a
      JOIN users u ON u.tenant_id = a.tenant_id
      WHERE u.auth_user_id = auth.uid()
        AND a.id = trouvetou_listings.establishment_id
    )
  );

COMMENT ON TABLE trouvetou_listings IS 'Vitrines publiées sur Trouvetou depuis le dashboard Séjoura';
COMMENT ON COLUMN trouvetou_listings.unit_id IS 'Unité hébergée (dans cette implémentation, correspond à la table rooms)';
COMMENT ON COLUMN trouvetou_listings.is_published IS 'Indique si la fiche est visible sur le portail public Trouvetou';

-- =========================================================
-- EXTENSION : Boost Express (ESSENTIEL) & Boost Permanent (ENTREPRISE)
-- ADDITIVE — ne modifie pas les colonnes existantes ci-dessus
-- =========================================================

-- 1. Colonnes Boost additionnelles
ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS is_permanently_boosted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boost_express_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boost_express_price_paid INTEGER DEFAULT 0;

COMMENT ON COLUMN accommodations.is_permanently_boosted
  IS 'Boost permanent ENTREPRISE (55 000 FCFA/mois). Actif en permanence.';
COMMENT ON COLUMN accommodations.boost_express_expires_at
  IS 'Expiration Boost Express ESSENTIEL (ex: NOW() + 3 jours, 5 000 FCFA). NULL = inactif.';
COMMENT ON COLUMN accommodations.boost_express_price_paid
  IS 'Prix payé pour le dernier Boost Express activé (FCFA).';

-- 2. Vue de statut boost (logique unifiée)
CREATE OR REPLACE VIEW trouvetou_boost_status AS
SELECT
  id                                                         AS accommodation_id,
  is_permanently_boosted,
  is_boosted                                                 AS is_legacy_boosted,
  boost_expires_at                                           AS legacy_boost_expires_at,
  boost_express_expires_at,
  boost_express_price_paid,
  (boost_express_expires_at IS NOT NULL
   AND boost_express_expires_at > NOW())                     AS is_express_boost_active,
  (
    is_permanently_boosted = TRUE
    OR (boost_express_expires_at IS NOT NULL AND boost_express_expires_at > NOW())
    OR (is_boosted = TRUE AND (boost_expires_at IS NULL OR boost_expires_at > NOW()))
  )                                                          AS is_boost_active,
  CASE
    WHEN is_permanently_boosted = TRUE                                             THEN 2
    WHEN boost_express_expires_at IS NOT NULL AND boost_express_expires_at > NOW() THEN 1
    WHEN is_boosted = TRUE AND (boost_expires_at IS NULL OR boost_expires_at > NOW()) THEN 1
    ELSE 0
  END                                                        AS boost_priority,
  CASE
    WHEN is_permanently_boosted = TRUE                                             THEN 'permanent'
    WHEN boost_express_expires_at IS NOT NULL AND boost_express_expires_at > NOW() THEN 'express'
    WHEN is_boosted = TRUE AND (boost_expires_at IS NULL OR boost_expires_at > NOW()) THEN 'legacy'
    ELSE 'none'
  END                                                        AS boost_type
FROM accommodations;

COMMENT ON VIEW trouvetou_boost_status
  IS 'État boost unifié par établissement : priorité 2 (Permanent/Entreprise), 1 (Express/Essentiel), 0 (Standard).';

-- 3. Trigger : protection plan pour le boost permanent
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
