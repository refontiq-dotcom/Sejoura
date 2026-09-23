-- Harden Wave subscription webhook processing.
-- The production database may already contain these objects; keep this migration idempotent.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS payments_wave_subscription_reference_unique
  ON public.payments(reference)
  WHERE operation_type = 'subscription'
    AND mobile_money_operator = 'wave'
    AND reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.process_wave_checkout_webhook(
  p_event_id text,
  p_event_type text,
  p_subscription_id uuid,
  p_checkout_id text,
  p_amount integer,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_receiver_id uuid;
  v_now timestamptz := now();
  v_period_end timestamptz := now() + interval '30 days';
  v_reference text;
  v_inserted integer;
BEGIN
  IF p_event_id IS NULL OR length(trim(p_event_id)) = 0 THEN
    RAISE EXCEPTION 'WAVE_EVENT_ID_REQUIRED';
  END IF;

  IF p_event_type IS DISTINCT FROM 'checkout.session.completed' THEN
    INSERT INTO public.wave_webhook_events(id, event_type)
    VALUES (p_event_id, p_event_type)
    ON CONFLICT (id) DO NOTHING;

    RETURN jsonb_build_object('processed', true, 'ignored', true);
  END IF;

  IF p_subscription_id IS NULL THEN
    RAISE EXCEPTION 'WAVE_SUBSCRIPTION_REQUIRED';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'WAVE_AMOUNT_INVALID';
  END IF;

  IF p_currency IS DISTINCT FROM 'XOF' THEN
    RAISE EXCEPTION 'WAVE_CURRENCY_INVALID';
  END IF;

  SELECT *
    INTO v_subscription
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WAVE_SUBSCRIPTION_NOT_FOUND';
  END IF;

  IF v_subscription.monthly_price IS NULL
     OR p_amount <> v_subscription.monthly_price THEN
    RAISE EXCEPTION 'WAVE_AMOUNT_MISMATCH';
  END IF;

  v_reference := COALESCE(NULLIF(trim(p_checkout_id), ''), p_event_id);

  SELECT u.id
    INTO v_receiver_id
  FROM public.users u
  WHERE u.tenant_id = v_subscription.tenant_id
    AND u.role = 'admin_residence'
    AND u.is_active = true
  ORDER BY u.created_at
  LIMIT 1;

  IF v_receiver_id IS NULL THEN
    RAISE EXCEPTION 'WAVE_RECEIVER_NOT_FOUND';
  END IF;

  INSERT INTO public.wave_webhook_events(id, event_type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('processed', true, 'duplicate', true);
  END IF;

  UPDATE public.subscriptions
  SET
    status = 'active',
    subscription_status = 'active',
    current_period_start = v_now,
    current_period_end = v_period_end,
    subscription_end_date = v_period_end,
    is_soft_locked = false,
    last_payment_at = v_now,
    last_payment_amount = p_amount,
    payment_method = 'wave',
    last_auto_payment_at = v_now,
    last_auto_payment_provider = 'wave',
    auto_renew_enabled = false,
    updated_at = v_now
  WHERE id = v_subscription.id;

  INSERT INTO public.payments(
    tenant_id,
    booking_id,
    amount,
    payment_method,
    mobile_money_operator,
    payment_date,
    reference,
    received_by,
    operation_type,
    notes
  )
  VALUES (
    v_subscription.tenant_id,
    NULL,
    p_amount,
    'mobile_money',
    'wave',
    v_now,
    v_reference,
    v_receiver_id,
    'subscription',
    format('Paiement d''abonnement Wave %s', p_event_id)
  )
  ON CONFLICT (reference)
  WHERE operation_type = 'subscription'
    AND mobile_money_operator = 'wave'
    AND reference IS NOT NULL
  DO NOTHING;

  RETURN jsonb_build_object(
    'processed', true,
    'duplicate', false,
    'subscription_id', v_subscription.id,
    'tenant_id', v_subscription.tenant_id,
    'amount', p_amount,
    'reference', v_reference
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_wave_checkout_webhook(text,text,uuid,text,integer,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_wave_checkout_webhook(text,text,uuid,text,integer,text)
  TO service_role;

COMMIT;
