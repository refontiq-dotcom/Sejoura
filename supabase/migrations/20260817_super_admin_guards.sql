-- ----------------------------------------------------------------------------
-- Garde Super Admin sur suspend_tenant et reactivate_tenant
-- Ces fonctions sont SECURITY DEFINER et pouvaient être appelées par tout
-- utilisateur authentifié. On restreint leur exécution au rôle super_admin.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION suspend_tenant(
  p_tenant_id UUID,
  p_reason TEXT
)
RETURNS tenants AS $$
DECLARE
  v_tenant tenants;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut suspendre un établissement';
  END IF;

  UPDATE tenants
  SET
    is_suspended = TRUE,
    suspended_reason = p_reason,
    suspended_at = NOW()
  WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  -- Suspendre l'abonnement
  UPDATE subscriptions
  SET
    status = 'suspended',
    is_soft_locked = TRUE
  WHERE tenant_id = p_tenant_id;

  -- Désactiver tous les utilisateurs
  UPDATE users
  SET is_active = FALSE
  WHERE tenant_id = p_tenant_id;

  RETURN v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reactivate_tenant(
  p_tenant_id UUID
)
RETURNS tenants AS $$
DECLARE
  v_tenant tenants;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut réactiver un établissement';
  END IF;

  UPDATE tenants
  SET
    is_suspended = FALSE,
    suspended_reason = NULL,
    suspended_at = NULL
  WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  -- Réactiver l'abonnement
  UPDATE subscriptions
  SET
    status = 'active',
    is_soft_locked = FALSE
  WHERE tenant_id = p_tenant_id;

  -- Réactiver les utilisateurs
  UPDATE users
  SET is_active = TRUE
  WHERE tenant_id = p_tenant_id;

  RETURN v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
