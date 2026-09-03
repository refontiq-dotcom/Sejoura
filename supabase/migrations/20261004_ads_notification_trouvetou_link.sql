-- Les notifications publicité pointent désormais vers l'option Publicités
-- de la vitrine Trouvetou (plus de module /dashboard/ads autonome).
UPDATE notifications
SET link = '/dashboard/trouvetou?tab=ads'
WHERE link = '/dashboard/ads';

CREATE OR REPLACE FUNCTION validate_advertisement_payment(p_request_id UUID)
RETURNS advertisement_payment_requests AS $$
DECLARE
  v_request advertisement_payment_requests;
  v_admin_user_id UUID;
  v_starts TIMESTAMPTZ;
  v_ends TIMESTAMPTZ;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut confirmer le paiement d''une publicité';
  END IF;

  SELECT * INTO v_request
  FROM advertisement_payment_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Demande de paiement introuvable ou déjà traitée';
  END IF;

  v_starts := NOW();
  v_ends := NOW() + (v_request.duration_days || ' days')::INTERVAL;

  UPDATE advertisements
  SET
    status       = 'active',
    starts_at    = v_starts,
    ends_at      = v_ends,
    sender_phone = COALESCE(advertisements.sender_phone, v_request.sender_phone)
  WHERE id = v_request.advertisement_id
    AND status IN ('pending_payment', 'rejected');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AD_NOT_PENDING: La publicité n''est pas en attente de validation';
  END IF;

  SELECT id INTO v_admin_user_id
  FROM users
  WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  LIMIT 1;

  UPDATE advertisement_payment_requests
  SET
    status       = 'validated',
    validated_by = v_admin_user_id,
    validated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (
    v_request.tenant_id,
    NULL,
    'Publicité activée',
    'Votre publicité a été validée et est désormais diffusée sur Trouvetou.',
    'success',
    '/dashboard/trouvetou?tab=ads'
  );

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_advertisement_payment(p_request_id UUID)
RETURNS advertisement_payment_requests AS $$
DECLARE
  v_request advertisement_payment_requests;
  v_admin_user_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut rejeter le paiement d''une publicité';
  END IF;

  SELECT * INTO v_request
  FROM advertisement_payment_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Demande de paiement introuvable ou déjà traitée';
  END IF;

  UPDATE advertisements
  SET status = 'rejected'
  WHERE id = v_request.advertisement_id
    AND status = 'pending_payment';

  SELECT id INTO v_admin_user_id
  FROM users
  WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  LIMIT 1;

  UPDATE advertisement_payment_requests
  SET
    status       = 'rejected',
    validated_by = v_admin_user_id,
    validated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (
    v_request.tenant_id,
    NULL,
    'Paiement publicité rejeté',
    'Votre preuve de règlement n''a pas pu être confirmée. Vous pouvez soumettre une nouvelle demande.',
    'warning',
    '/dashboard/trouvetou?tab=ads'
  );

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
