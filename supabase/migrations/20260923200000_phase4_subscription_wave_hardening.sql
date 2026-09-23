-- Phase 4 P0/P1: subscription lifecycle, Wave manual payment integrity and access hardening.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_plan public.subscription_plan;

CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON public.subscriptions (current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscription_payment_requests_tenant_status ON public.subscription_payment_requests (tenant_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payment_requests_one_pending_per_tenant ON public.subscription_payment_requests (tenant_id) WHERE status = 'pending';

DROP POLICY IF EXISTS subscriptions_update_own_admin ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_payment_requests FROM authenticated, anon;

DROP POLICY IF EXISTS payments_update_own ON public.payments;
CREATE POLICY payments_update_own ON public.payments
FOR UPDATE TO authenticated
USING (
  tenant_id = (select public.get_current_user_tenant_id())
  AND public.get_current_user_role() = ANY (ARRAY['admin_residence'::public.user_role,'receptionniste'::public.user_role])
)
WITH CHECK (
  tenant_id = (select public.get_current_user_tenant_id())
  AND public.get_current_user_role() = ANY (ARRAY['admin_residence'::public.user_role,'receptionniste'::public.user_role])
);

CREATE OR REPLACE FUNCTION public.request_subscription_cancellation(p_user_id uuid)
RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_subscription public.subscriptions;
BEGIN
  PERFORM public.assert_current_user(p_user_id);
  SELECT s.* INTO v_subscription FROM public.subscriptions s
  WHERE s.tenant_id = public.get_current_user_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND: Abonnement introuvable'; END IF;
  IF v_subscription.status IN ('expired','cancelled') OR v_subscription.is_soft_locked THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_ACTIVE: Cet abonnement ne peut plus être annulé';
  END IF;
  UPDATE public.subscriptions SET cancel_at_period_end=true, updated_at=NOW()
  WHERE id=v_subscription.id RETURNING * INTO v_subscription;
  RETURN v_subscription;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_subscription_cancellation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_subscription_cancellation(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_subscription_payment_request(p_user_id uuid,p_plan text,p_amount integer,p_sender_phone text)
RETURNS public.subscription_payment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_user public.users; v_subscription public.subscriptions; v_existing public.subscription_payment_requests; v_request public.subscription_payment_requests;
BEGIN
  PERFORM public.assert_current_user(p_user_id);
  SELECT * INTO v_user FROM public.users WHERE id=p_user_id;
  IF v_user.role <> 'admin_residence' THEN RAISE EXCEPTION 'FORBIDDEN: Accès réservé à l''administrateur de l''établissement'; END IF;
  IF p_plan NOT IN ('essentiel','croissance','entreprise','standard','growth','enterprise') THEN RAISE EXCEPTION 'PLAN_INVALID: Formule invalide'; END IF;
  IF p_amount <= 0 OR length(trim(coalesce(p_sender_phone,''))) < 8 THEN RAISE EXCEPTION 'PAYMENT_DATA_INVALID: Données de paiement invalides'; END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE tenant_id=v_user.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND: Abonnement introuvable'; END IF;
  SELECT * INTO v_existing FROM public.subscription_payment_requests
  WHERE tenant_id=v_user.tenant_id AND status='pending'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN v_existing; END IF;
  INSERT INTO public.subscription_payment_requests(tenant_id,subscription_id,plan,amount,status,requested_by,sender_phone,notes)
  VALUES(v_user.tenant_id,v_subscription.id,p_plan,p_amount,'pending',p_user_id,trim(p_sender_phone),'Paiement déclaré par le gérant après paiement via lien Wave')
  RETURNING * INTO v_request;
  UPDATE public.subscriptions SET subscription_status='pending',updated_at=NOW() WHERE id=v_subscription.id;
  RETURN v_request;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_subscription_payment_request(uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_subscription_payment_request(uuid,text,integer,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_subscription_period_end_transitions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_count integer:=0;
BEGIN
  UPDATE public.subscriptions
  SET status=CASE WHEN cancel_at_period_end THEN 'expired'::subscription_status ELSE status END,
      subscription_status=CASE WHEN cancel_at_period_end THEN 'expired' ELSE subscription_status END,
      is_soft_locked=CASE WHEN cancel_at_period_end THEN true ELSE is_soft_locked END,
      plan=COALESCE(scheduled_plan,plan),
      monthly_price=CASE WHEN scheduled_plan IS NULL THEN monthly_price
        WHEN scheduled_plan::text='essentiel' THEN 15000
        WHEN scheduled_plan::text='croissance' THEN 25000
        WHEN scheduled_plan::text='entreprise' THEN 50000
        ELSE monthly_price END,
      scheduled_plan=NULL,cancel_at_period_end=false,updated_at=NOW()
  WHERE current_period_end IS NOT NULL AND current_period_end<=NOW()
    AND status='active' AND (cancel_at_period_end=true OR scheduled_plan IS NOT NULL);
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_subscription_period_end_transitions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_period_end_transitions() TO service_role;