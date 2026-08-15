-- 20260824_subscription_prolong_current_end.sql
-- Renouvellement anticipé : la date de fin de l'abonnement est prolongée de 30
-- jours à compter de la date de fin actuelle si celle-ci est dans le futur,
-- sinon à compter d'aujourd'hui (reprise après expiration).
--
-- Idempotent : ré-exécutable sans erreur.

CREATE OR REPLACE FUNCTION validate_subscription_payment(p_request_id UUID)
RETURNS subscription_payment_requests AS $$
DECLARE
  v_request subscription_payment_requests;
  v_subscription_id UUID;
  v_end_date TIMESTAMPTZ;
  v_admin_user_id UUID;
  v_tenant_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut valider un paiement d''abonnement';
  END IF;

  SELECT * INTO v_request
  FROM subscription_payment_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Demande de paiement introuvable ou déjà traitée';
  END IF;

  v_tenant_id := v_request.tenant_id;

  SELECT id INTO v_subscription_id
  FROM subscriptions
  WHERE tenant_id = v_tenant_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND: Aucun abonnement trouvé pour cet établissement';
  END IF;

  -- Date de fin : prolongation de 30 jours à compter d'aujourd'hui, ou depuis la
  -- date de fin actuelle si celle-ci est dans le futur (renouvellement anticipé).
  SELECT COALESCE(subscription_end_date, NOW()) INTO v_end_date
  FROM subscriptions
  WHERE id = v_subscription_id;

  v_end_date := GREATEST(NOW(), v_end_date) + INTERVAL '30 days';

  -- Activation de l'abonnement + déblocage des interrupteurs
  UPDATE subscriptions
  SET
    subscription_status   = 'active',
    subscription_end_date = v_end_date,
    status                = 'active',
    is_soft_locked        = FALSE,
    current_period_start  = NOW(),
    current_period_end    = v_end_date,
    plan                  = v_request.plan::subscription_plan,
    monthly_price         = v_request.amount,
    payment_method        = 'wave',
    last_payment_at       = NOW(),
    last_payment_amount   = v_request.amount
  WHERE id = v_subscription_id;

  -- Réactiver les utilisateurs de l'établissement le cas échéant
  UPDATE users SET is_active = TRUE WHERE tenant_id = v_tenant_id;

  -- Marquer la demande comme validée
  SELECT id INTO v_admin_user_id
  FROM users
  WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  LIMIT 1;

  UPDATE subscription_payment_requests
  SET
    status       = 'validated',
    validated_by = v_admin_user_id,
    validated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  -- Notification pour le gérant de l'établissement
  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (
    v_tenant_id,
    NULL,
    'Abonnement activé',
    'Votre abonnement a été validé par l''administrateur. Merci pour votre paiement.',
    'success',
    '/dashboard/subscription'
  );

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
