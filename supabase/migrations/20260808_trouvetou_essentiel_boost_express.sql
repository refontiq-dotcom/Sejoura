-- ============================================================================
-- Migration : Trouvetou — Boost Express ESSENTIEL (additive + auto-suffisante)
-- Date      : 2026-08-08
-- ============================================================================
-- Ce fichier est 100% ADDITIF et IDEMPOTENT.
-- Il garantit l'existence des colonnes boost avant de créer triggers / vue,
-- quelle que soit l'ordre d'exécution des migrations précédentes.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 0. Colonnes boost — création idempotente (sécurité si trouvetou_module.sql
--       n'a pas encore été appliqué sur cette instance Supabase) ───────────────
ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS is_boosted               BOOLEAN    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boost_expires_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_permanently_boosted    BOOLEAN    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boost_express_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boost_express_price_paid  INTEGER    DEFAULT 0;

COMMENT ON COLUMN accommodations.is_permanently_boosted
  IS 'Boost permanent ENTREPRISE (55 000 FCFA/mois). Actif en permanence.';
COMMENT ON COLUMN accommodations.boost_express_expires_at
  IS 'Expiration Boost Express ESSENTIEL (ex: NOW() + 3 jours, 5 000 FCFA). NULL = inactif.';
COMMENT ON COLUMN accommodations.boost_express_price_paid
  IS 'Prix payé pour le dernier Boost Express activé (FCFA).';

-- ── 1. Index composite pour optimiser le tri côté portail public ─────────────
-- Accélère ORDER BY (is_permanently_boosted DESC, boost_express_expires_at DESC)
CREATE INDEX IF NOT EXISTS idx_accommodations_boost_priority
  ON accommodations (is_permanently_boosted DESC, boost_express_expires_at DESC NULLS LAST);

COMMENT ON INDEX idx_accommodations_boost_priority
  IS 'Optimise le tri Trouvetou par priorité boost : Permanent (Entreprise) → Express (Essentiel) → Standard';

-- ── 2. Index partiel : Boost Express actifs uniquement ───────────────────────
CREATE INDEX IF NOT EXISTS idx_accommodations_express_boost_active
  ON accommodations (boost_express_expires_at)
  WHERE boost_express_expires_at IS NOT NULL;

-- ── 3. Trigger : séparation propre Express (ESSENTIEL) ≠ Permanent (ENTREPRISE)
-- Empêche d'écrire boost_express_expires_at sur un plan Entreprise
-- (symétrique du trigger check_permanent_boost_plan déjà en place)
CREATE OR REPLACE FUNCTION check_express_boost_plan()
RETURNS TRIGGER AS $$
DECLARE
  v_plan TEXT;
BEGIN
  -- Seulement si on modifie boost_express_expires_at vers une valeur non-NULL
  IF NEW.boost_express_expires_at IS NOT NULL AND
     (OLD.boost_express_expires_at IS DISTINCT FROM NEW.boost_express_expires_at) THEN

    SELECT s.plan INTO v_plan
    FROM subscriptions s
    WHERE s.tenant_id = (
      SELECT tenant_id FROM accommodations WHERE id = NEW.id
    )
    LIMIT 1;

    IF v_plan IN ('entreprise', 'enterprise') THEN
      RAISE EXCEPTION
        '[Trouvetou] Boost Express réservé au plan ESSENTIEL. '
        'Les comptes ENTREPRISE utilisent le Boost Permanent. accommodation_id: %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_express_boost ON accommodations;
CREATE TRIGGER trigger_check_express_boost
  BEFORE UPDATE OF boost_express_expires_at ON accommodations
  FOR EACH ROW
  EXECUTE FUNCTION check_express_boost_plan();

-- ── 4. Fonction RPC : activation atomique du Boost Express ───────────────────
-- Appelable depuis le backend Next.js via supabase.rpc()
-- Gère la prolongation si un boost actif existe déjà
CREATE OR REPLACE FUNCTION activate_express_boost(
  p_accommodation_id UUID,
  p_duration_days    INTEGER,
  p_price_paid       INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id      UUID;
  v_plan           TEXT;
  v_current_expiry TIMESTAMPTZ;
  v_base_time      TIMESTAMPTZ;
  v_new_expiry     TIMESTAMPTZ;
BEGIN
  -- Récupérer le tenant et l'état actuel du boost
  SELECT
    tenant_id,
    boost_express_expires_at
  INTO v_tenant_id, v_current_expiry
  FROM accommodations
  WHERE id = p_accommodation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Établissement introuvable : %', p_accommodation_id;
  END IF;

  -- Vérifier le plan
  SELECT plan INTO v_plan
  FROM subscriptions
  WHERE tenant_id = v_tenant_id
  LIMIT 1;

  IF v_plan NOT IN ('essentiel') THEN
    RAISE EXCEPTION
      '[Trouvetou] Boost Express réservé au plan ESSENTIEL. Plan actuel : %', v_plan;
  END IF;

  -- Calcul de la nouvelle expiration (prolongation si boost déjà actif)
  v_base_time := GREATEST(NOW(), COALESCE(v_current_expiry, NOW()));
  v_new_expiry := v_base_time + (p_duration_days || ' days')::INTERVAL;

  -- Mise à jour atomique
  UPDATE accommodations
  SET
    boost_express_expires_at = v_new_expiry,
    boost_express_price_paid = p_price_paid
  WHERE id = p_accommodation_id;

  RETURN jsonb_build_object(
    'success',        TRUE,
    'expires_at',     v_new_expiry,
    'duration_days',  p_duration_days,
    'price_fcfa',     p_price_paid
  );
END;
$$;

COMMENT ON FUNCTION activate_express_boost(UUID, INTEGER, INTEGER)
  IS 'Active ou prolonge le Boost Express (ESSENTIEL) pour un établissement. Atomique et sécurisé.';

-- ── 5. Mise à jour de la vue trouvetou_boost_status pour exposer boost_type ──
CREATE OR REPLACE VIEW trouvetou_boost_status AS
SELECT
  id                                                           AS accommodation_id,
  is_permanently_boosted,
  is_boosted                                                   AS is_legacy_boosted,
  boost_expires_at                                             AS legacy_boost_expires_at,
  boost_express_expires_at,
  boost_express_price_paid,
  (boost_express_expires_at IS NOT NULL
   AND boost_express_expires_at > NOW())                       AS is_express_boost_active,
  (
    is_permanently_boosted = TRUE
    OR (boost_express_expires_at IS NOT NULL AND boost_express_expires_at > NOW())
    OR (is_boosted = TRUE AND (boost_expires_at IS NULL OR boost_expires_at > NOW()))
  )                                                            AS is_boost_active,
  CASE
    WHEN is_permanently_boosted = TRUE                                               THEN 2
    WHEN boost_express_expires_at IS NOT NULL AND boost_express_expires_at > NOW()   THEN 1
    WHEN is_boosted = TRUE AND (boost_expires_at IS NULL OR boost_expires_at > NOW()) THEN 1
    ELSE 0
  END                                                          AS boost_priority,
  -- Champ bonus : type de boost lisible côté portail
  CASE
    WHEN is_permanently_boosted = TRUE                                               THEN 'permanent'
    WHEN boost_express_expires_at IS NOT NULL AND boost_express_expires_at > NOW()   THEN 'express'
    WHEN is_boosted = TRUE AND (boost_expires_at IS NULL OR boost_expires_at > NOW()) THEN 'legacy'
    ELSE 'none'
  END                                                          AS boost_type
FROM accommodations;

COMMENT ON VIEW trouvetou_boost_status
  IS 'État boost unifié (v2) : priorité 2 (Permanent/Entreprise), 1 (Express/Essentiel ou Legacy), 0 (Standard). Inclut boost_type.';
