-- ----------------------------------------------------------------------------
-- REJETER une demande de paiement d'abonnement (Super Admin uniquement)
-- Marque la demande comme rejetée et notifie le gérant de l'établissement.
-- L'abonnement n'est pas modifié : le gérant peut corriger et soumettre une
-- nouvelle demande.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_subscription_payment(p_request_id UUID)
RETURNS subscription_payment_requests AS $$
DECLARE
  v_request subscription_payment_requests;
  v_admin_user_id UUID;
  v_tenant_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut rejeter une demande de paiement';
  END IF;

  SELECT * INTO v_request
  FROM subscription_payment_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Demande de paiement introuvable ou déjà traitée';
  END IF;

  v_tenant_id := v_request.tenant_id;

  SELECT id INTO v_admin_user_id
  FROM users
  WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  LIMIT 1;

  UPDATE subscription_payment_requests
  SET
    status       = 'rejected',
    validated_by = v_admin_user_id,
    validated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  -- Notification pour le gérant de l'établissement
  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (
    v_tenant_id,
    NULL,
    'Paiement rejeté',
    'Votre paiement d''abonnement n''a pas pu être validé. Vérifiez le numéro Wave indiqué et soumettez une nouvelle demande.',
    'error',
    '/dashboard/subscription'
  );

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
