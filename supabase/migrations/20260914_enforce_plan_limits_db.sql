-- ============================================================================
-- Migration : Application des limites de plan côté base de données
-- Date      : 2026-09-13
-- ============================================================================
-- Contexte : les limites de plan (nombre d'établissements, d'unités, de
-- comptes système) n'étaient vérifiées QUE côté interface (dashboard React).
-- Comme les créations passent directement par le client Supabase (protégées
-- par RLS mais pas par une limite de plan), un utilisateur technique pouvait
-- contourner les paliers Essentiel/Croissance en appelant l'API Supabase
-- directement. Cette migration ajoute la vérification au niveau base de
-- données — la seule barrière qui ne peut pas être contournée.
--
-- Les seuils reproduisent exactement getPlanLimits() dans
-- src/lib/subscription-plans.ts. Si vous changez les limites côté
-- application, pensez à répercuter le changement ici aussi.
-- ============================================================================

-- ── 1. Fonction utilitaire : limites du plan d'un tenant ────────────────────
-- Retourne NULL pour "illimité" (cohérent avec getPlanLimits() en TypeScript).
CREATE OR REPLACE FUNCTION get_plan_limits(p_tenant_id UUID)
RETURNS TABLE (
  max_accommodations   INTEGER,
  max_units            INTEGER,
  max_system_accounts  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT s.plan::TEXT INTO v_plan
  FROM subscriptions s
  WHERE s.tenant_id = p_tenant_id
  LIMIT 1;

  IF v_plan IN ('entreprise', 'enterprise') THEN
    RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, NULL::INTEGER;
  ELSIF v_plan = 'croissance' THEN
    RETURN QUERY SELECT 1::INTEGER, 35::INTEGER, 5::INTEGER;
  ELSE
    -- Essentiel, standard, free, ou plan inconnu/absent : limites Essentiel
    RETURN QUERY SELECT 1::INTEGER, 10::INTEGER, 2::INTEGER;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_plan_limits(UUID)
  IS 'Limites d''usage (établissements/unités/comptes) du plan d''un tenant. NULL = illimité. Reflète getPlanLimits() côté TypeScript.';

-- ── 2. Trigger : limite du nombre d'établissements (accommodations) ─────────
CREATE OR REPLACE FUNCTION check_accommodations_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_max   INTEGER;
  v_count INTEGER;
BEGIN
  SELECT max_accommodations INTO v_max FROM get_plan_limits(NEW.tenant_id);

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM accommodations WHERE tenant_id = NEW.tenant_id;
    IF v_count >= v_max THEN
      RAISE EXCEPTION
        '[Plan] Limite d''établissements atteinte (% max). Passez à une formule supérieure pour en ajouter.', v_max;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_accommodations_limit ON accommodations;
CREATE TRIGGER trigger_check_accommodations_limit
  BEFORE INSERT ON accommodations
  FOR EACH ROW
  EXECUTE FUNCTION check_accommodations_limit();

-- ── 3. Trigger : limite du nombre d'unités (rooms), tous établissements
--      confondus pour le tenant ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_rooms_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_max       INTEGER;
  v_count     INTEGER;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM accommodations
  WHERE id = NEW.accommodation_id;

  SELECT max_units INTO v_max FROM get_plan_limits(v_tenant_id);

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM rooms r
    JOIN accommodations a ON a.id = r.accommodation_id
    WHERE a.tenant_id = v_tenant_id;

    IF v_count >= v_max THEN
      RAISE EXCEPTION
        '[Plan] Limite d''unités atteinte (% max). Passez à une formule supérieure pour en ajouter.', v_max;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_rooms_limit ON rooms;
CREATE TRIGGER trigger_check_rooms_limit
  BEFORE INSERT ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION check_rooms_limit();

-- ── 4. Trigger : limite du nombre de comptes système (admin_residence,
--      receptionniste, menagere — hors 'client' et 'super_admin') ──────────
CREATE OR REPLACE FUNCTION check_system_accounts_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_max   INTEGER;
  v_count INTEGER;
BEGIN
  -- Le rôle 'client' (accès portail) et 'super_admin' (hors tenant) ne
  -- comptent pas dans les comptes système facturables.
  IF NEW.tenant_id IS NULL OR NEW.role NOT IN ('admin_residence', 'receptionniste', 'menagere') THEN
    RETURN NEW;
  END IF;

  SELECT max_system_accounts INTO v_max FROM get_plan_limits(NEW.tenant_id);

  IF v_max IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM users
    WHERE tenant_id = NEW.tenant_id
      AND role IN ('admin_residence', 'receptionniste', 'menagere');

    IF v_count >= v_max THEN
      RAISE EXCEPTION
        '[Plan] Limite de comptes système atteinte (% max). Passez à une formule supérieure pour en ajouter.', v_max;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_system_accounts_limit ON users;
CREATE TRIGGER trigger_check_system_accounts_limit
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION check_system_accounts_limit();
