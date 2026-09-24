-- Fix subscription status transitions to use valid subscription_status enum values.
-- subscription_status remains text and may use 'expired'; status uses public.subscription_status enum.
CREATE OR REPLACE FUNCTION public.apply_subscription_period_end_transitions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.subscriptions
  SET status = CASE
        WHEN cancel_at_period_end THEN 'cancelled'::public.subscription_status
        ELSE status
      END,
      subscription_status = CASE
        WHEN cancel_at_period_end THEN 'expired'
        ELSE subscription_status
      END,
      is_soft_locked = CASE
        WHEN cancel_at_period_end THEN true
        ELSE is_soft_locked
      END,
      plan = COALESCE(scheduled_plan, plan),
      monthly_price = CASE
        WHEN scheduled_plan IS NULL THEN monthly_price
        WHEN scheduled_plan::text = 'essentiel' THEN 15000
        WHEN scheduled_plan::text = 'croissance' THEN 25000
        WHEN scheduled_plan::text = 'entreprise' THEN 50000
        ELSE monthly_price
      END,
      scheduled_plan = NULL,
      cancel_at_period_end = false,
      updated_at = NOW()
  WHERE current_period_end IS NOT NULL
    AND current_period_end <= NOW()
    AND status = 'active'::public.subscription_status
    AND (cancel_at_period_end = true OR scheduled_plan IS NOT NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_subscription_cancellation(p_user_id uuid)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_subscription public.subscriptions;
BEGIN
  PERFORM public.assert_current_user(p_user_id);

  SELECT s.* INTO v_subscription
  FROM public.subscriptions s
  WHERE s.tenant_id = public.get_current_user_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND: Abonnement introuvable';
  END IF;

  IF v_subscription.status IN ('cancelled'::public.subscription_status, 'suspended'::public.subscription_status)
     OR v_subscription.subscription_status = 'expired'
     OR v_subscription.is_soft_locked THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_ACTIVE: Cet abonnement ne peut plus être annulé';
  END IF;

  UPDATE public.subscriptions
  SET cancel_at_period_end = true, updated_at = NOW()
  WHERE id = v_subscription.id
  RETURNING * INTO v_subscription;

  RETURN v_subscription;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_subscription_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET subscription_status = 'expired',
      is_soft_locked = TRUE,
      status = CASE
        WHEN status IN ('trial'::public.subscription_status, 'active'::public.subscription_status)
        THEN 'suspended'::public.subscription_status
        ELSE status
      END
  WHERE subscription_status = 'active'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
