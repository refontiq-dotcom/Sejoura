-- ============================================================================
-- Migration : Verrouillage côté base des dépenses (comptabilité avancée)
-- Date      : 2026-09-16
-- ============================================================================
-- Contexte : la page /dashboard/accounting bloque désormais les boutons
-- (ajouter/modifier/supprimer une dépense) côté interface pour les plans
-- sans accès à la comptabilité avancée (Essentiel, Croissance). Mais les
-- écritures passent par le client Supabase (RLS uniquement) : un appel
-- direct à l'API Supabase pouvait toujours contourner ce blocage visuel.
--
-- Ajoute un trigger BEFORE INSERT/UPDATE/DELETE sur `expenses` qui vérifie
-- que le tenant a bien accès à la comptabilité avancée (plan Entreprise),
-- reflétant canAccessFeature('advancedAccounting', plan) côté TypeScript.
--
-- La génération de reçus PDF par réservation (/api/invoice/generate) N'EST
-- PAS concernée : elle reste une fonctionnalité de base ouverte à tous les
-- plans, conformément à l'offre Essentiel.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_advanced_accounting_access()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_plan      TEXT;
BEGIN
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  SELECT plan::TEXT INTO v_plan
  FROM subscriptions
  WHERE tenant_id = v_tenant_id
  LIMIT 1;

  IF v_plan NOT IN ('entreprise', 'enterprise') THEN
    RAISE EXCEPTION
      '[Plan] La comptabilité avancée (dépenses, bénéfice net, journal d''audit) est réservée à la formule Entreprise.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_expenses_plan ON expenses;
CREATE TRIGGER trigger_check_expenses_plan
  BEFORE INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION check_advanced_accounting_access();

COMMENT ON FUNCTION check_advanced_accounting_access()
  IS 'Bloque les écritures sur les tables de comptabilité avancée pour les plans sans accès (Essentiel, Croissance). Reflète canAccessFeature(''advancedAccounting'', plan) côté TypeScript.';
