-- Phase 2 / P1 performance hardening
-- Generated after applying migration 20260923161234.
-- Indexes all previously unindexed public foreign keys.
-- Wraps direct auth.uid()/auth.role() calls in RLS policies to avoid per-row re-evaluation.

CREATE INDEX IF NOT EXISTS idx_advertisement_payment_requests_requested_by ON public.advertisement_payment_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_advertisement_payment_requests_validated_by ON public.advertisement_payment_requests (validated_by);
CREATE INDEX IF NOT EXISTS idx_advertisements_created_by ON public.advertisements (created_by);
CREATE INDEX IF NOT EXISTS idx_booking_extensions_created_by ON public.booking_extensions (created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON public.bookings (created_by);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_booking_id ON public.cleaning_tasks (booking_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_completed_by ON public.cleaning_tasks (completed_by);
CREATE INDEX IF NOT EXISTS idx_client_service_requests_client_id ON public.client_service_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_client_sessions_client_id ON public.client_sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_client_sessions_tenant_id ON public.client_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_stay_extension_requests_client_id ON public.client_stay_extension_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_client_stay_extension_requests_processed_by ON public.client_stay_extension_requests (processed_by);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_by ON public.feature_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_hr_employees_created_by ON public.hr_employees (created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_payments_received_by ON public.payments (received_by);
CREATE INDEX IF NOT EXISTS idx_shifts_accommodation_id ON public.shifts (accommodation_id);
CREATE INDEX IF NOT EXISTS idx_stay_activities_created_by ON public.stay_activities (created_by);
CREATE INDEX IF NOT EXISTS idx_stay_notes_created_by ON public.stay_notes (created_by);
CREATE INDEX IF NOT EXISTS idx_subscription_payment_requests_requested_by ON public.subscription_payment_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_subscription_payment_requests_subscription_id ON public.subscription_payment_requests (subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payment_requests_validated_by ON public.subscription_payment_requests (validated_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_booking_id ON public.whatsapp_messages (booking_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_client_id ON public.whatsapp_messages (client_id);

ALTER POLICY "billing_configs_read" ON public.billing_configs USING ((select auth.uid()) IS NOT NULL);
ALTER POLICY "employee_assignments_delete" ON public.employee_assignments USING (((select auth.uid()) IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.users WHERE users.auth_user_id = (select auth.uid()) AND users.role = 'super_admin'::user_role) OR (EXISTS (SELECT 1 FROM public.users admin_user WHERE admin_user.auth_user_id = (select auth.uid()) AND admin_user.role = 'admin_residence'::user_role) AND EXISTS (SELECT 1 FROM public.users eu WHERE eu.id = employee_assignments.user_id AND eu.tenant_id = public.get_current_user_tenant_id()))));
ALTER POLICY "employee_assignments_insert" ON public.employee_assignments WITH CHECK (((select auth.uid()) IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.users WHERE users.auth_user_id = (select auth.uid()) AND users.role = 'super_admin'::user_role) OR (EXISTS (SELECT 1 FROM public.users admin_user WHERE admin_user.auth_user_id = (select auth.uid()) AND admin_user.role = 'admin_residence'::user_role) AND EXISTS (SELECT 1 FROM public.users eu WHERE eu.id = employee_assignments.user_id AND eu.tenant_id = public.get_current_user_tenant_id()) AND EXISTS (SELECT 1 FROM public.accommodations a WHERE a.id = employee_assignments.accommodation_id AND a.tenant_id = public.get_current_user_tenant_id()))));
ALTER POLICY "employee_assignments_select" ON public.employee_assignments USING (((select auth.uid()) IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.users WHERE users.auth_user_id = (select auth.uid()) AND users.role = 'super_admin'::user_role) OR EXISTS (SELECT 1 FROM public.users eu WHERE eu.id = employee_assignments.user_id AND eu.tenant_id = (SELECT users.tenant_id FROM public.users WHERE users.auth_user_id = (select auth.uid()) LIMIT 1))));
ALTER POLICY "employee_assignments_update" ON public.employee_assignments USING (((select auth.uid()) IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.users WHERE users.auth_user_id = (select auth.uid()) AND users.role = 'super_admin'::user_role) OR (EXISTS (SELECT 1 FROM public.users admin_user WHERE admin_user.auth_user_id = (select auth.uid()) AND admin_user.role = 'admin_residence'::user_role) AND EXISTS (SELECT 1 FROM public.users eu WHERE eu.id = employee_assignments.user_id AND eu.tenant_id = public.get_current_user_tenant_id())))) WITH CHECK (((select auth.uid()) IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.users WHERE users.auth_user_id = (select auth.uid()) AND users.role = 'super_admin'::user_role) OR (EXISTS (SELECT 1 FROM public.users admin_user WHERE admin_user.auth_user_id = (select auth.uid()) AND admin_user.role = 'admin_residence'::user_role) AND EXISTS (SELECT 1 FROM public.users eu WHERE eu.id = employee_assignments.user_id AND eu.tenant_id = public.get_current_user_tenant_id()) AND EXISTS (SELECT 1 FROM public.accommodations a WHERE a.id = employee_assignments.accommodation_id AND a.tenant_id = public.get_current_user_tenant_id()))));
ALTER POLICY "feature_request_votes_delete_own" ON public.feature_request_votes USING (user_id IN (SELECT users.id FROM public.users WHERE users.auth_user_id = (select auth.uid())));
ALTER POLICY "feature_request_votes_insert_auth" ON public.feature_request_votes WITH CHECK (user_id IN (SELECT users.id FROM public.users WHERE users.auth_user_id = (select auth.uid())) AND EXISTS (SELECT 1 FROM public.feature_requests fr WHERE fr.id = feature_request_votes.feature_request_id AND fr.created_by <> feature_request_votes.user_id));
DROP POLICY IF EXISTS "feature_request_votes_select_auth" ON public.feature_request_votes;
CREATE POLICY "feature_request_votes_select_auth" ON public.feature_request_votes FOR SELECT TO authenticated USING (true);
ALTER POLICY "feature_requests_insert_auth" ON public.feature_requests WITH CHECK (tenant_id = public.get_current_user_tenant_id() AND created_by IN (SELECT users.id FROM public.users WHERE users.auth_user_id = (select auth.uid())));
DROP POLICY IF EXISTS "feature_requests_select_auth" ON public.feature_requests;
CREATE POLICY "feature_requests_select_auth" ON public.feature_requests FOR SELECT TO authenticated USING ((NOT hidden) OR public.is_super_admin());
ALTER POLICY "notifications_select_own" ON public.notifications USING (tenant_id = public.get_current_user_tenant_id() AND ((user_id IS NULL) OR user_id = (SELECT users.id FROM public.users WHERE users.auth_user_id = (select auth.uid()))));
ALTER POLICY "notifications_update_own" ON public.notifications USING (tenant_id = public.get_current_user_tenant_id() AND ((user_id IS NULL) OR user_id = (SELECT users.id FROM public.users WHERE users.auth_user_id = (select auth.uid()))));
ALTER POLICY "sub_payment_intents_own" ON public.subscription_payment_intents USING (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.auth_user_id = (select auth.uid())));
ALTER POLICY "tenant_billing_profiles_own" ON public.tenant_billing_profiles USING (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.auth_user_id = (select auth.uid()))) WITH CHECK (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.auth_user_id = (select auth.uid())));
ALTER POLICY "tenants_insert_public" ON public.tenants WITH CHECK ((select auth.uid()) IS NOT NULL);
ALTER POLICY "trouvetou_listings_manage_own" ON public.trouvetou_listings USING (((select auth.uid()) IS NOT NULL) AND EXISTS (SELECT 1 FROM public.accommodations a JOIN public.users u ON u.tenant_id = a.tenant_id WHERE u.auth_user_id = (select auth.uid()) AND a.id = trouvetou_listings.establishment_id)) WITH CHECK (((select auth.uid()) IS NOT NULL) AND EXISTS (SELECT 1 FROM public.accommodations a JOIN public.users u ON u.tenant_id = a.tenant_id WHERE u.auth_user_id = (select auth.uid()) AND a.id = trouvetou_listings.establishment_id));
ALTER POLICY "trouvetou_providers_select_tenant" ON public.trouvetou_providers USING (((select auth.uid()) IS NOT NULL) AND EXISTS (SELECT 1 FROM public.accommodations a JOIN public.users u ON u.tenant_id = a.tenant_id WHERE u.auth_user_id = (select auth.uid()) AND a.id = trouvetou_providers.accommodation_id));
ALTER POLICY "Les utilisateurs peuvent lire leur propre profil" ON public.users USING ((select auth.uid()) = id);
ALTER POLICY "Les utilisateurs peuvent modifier leur propre profil" ON public.users USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);
ALTER POLICY "users_select_self" ON public.users USING (auth_user_id = (select auth.uid()));
ALTER POLICY "users_update_self" ON public.users USING (auth_user_id = (select auth.uid())) WITH CHECK (auth_user_id = (select auth.uid()));
