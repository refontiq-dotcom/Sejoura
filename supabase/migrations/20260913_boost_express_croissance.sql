-- ============================================================================
-- Migration : Ouvrir le Boost Express au plan CROISSANCE
-- Date      : 2026-09-13
-- ============================================================================
-- Contexte : nouvelle grille tarifaire à 3 paliers (Essentiel / Croissance /
-- Entreprise). Le Boost Express reste réservé aux plans sans Boost Permanent
-- (Essentiel et Croissance) ; le Boost Permanent reste exclusif Entreprise
-- (trigger check_permanent_boost_plan et check_express_boost_plan inchangés,
-- ils bloquent déjà uniquement 'entreprise'/'enterprise').
-- Cette migration met à jour la RPC activate_express_boost, qui limitait
-- explicitement l'accès au seul plan 'essentiel'.
-- ============================================================================

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

  IF v_plan NOT IN ('essentiel', 'croissance') THEN
    RAISE EXCEPTION
      '[Trouvetou] Boost Express réservé aux plans ESSENTIEL et CROISSANCE. Plan actuel : %', v_plan;
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
  IS 'Active ou prolonge le Boost Express (ESSENTIEL ou CROISSANCE) pour un établissement. Atomique et sécurisé.';
