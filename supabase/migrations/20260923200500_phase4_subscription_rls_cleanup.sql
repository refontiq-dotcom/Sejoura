-- Phase 4 P1: simplify subscription RLS policies after access hardening.
DROP POLICY IF EXISTS spr_service_role ON public.subscription_payment_requests;
DROP POLICY IF EXISTS subscriptions_select_super_admin ON public.subscriptions;
DROP POLICY IF EXISTS sub_payment_req_select_super_admin ON public.subscription_payment_requests;
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
FOR SELECT TO authenticated
USING (tenant_id=(select public.get_current_user_tenant_id()) OR public.is_super_admin());

DROP POLICY IF EXISTS sub_payment_req_select_own ON public.subscription_payment_requests;
CREATE POLICY sub_payment_req_select_own ON public.subscription_payment_requests
FOR SELECT TO authenticated
USING (tenant_id=(select public.get_current_user_tenant_id()) OR public.is_super_admin());
