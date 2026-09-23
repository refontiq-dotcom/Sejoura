-- Phase 5 P0/P1: harden tenant isolation, user identity uniqueness and employee assignments.

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_id_unique UNIQUE (auth_user_id);

ALTER TABLE public.employee_assignments
  ADD CONSTRAINT employee_assignments_valid_dates
  CHECK (end_date IS NULL OR start_date <= end_date);

CREATE INDEX IF NOT EXISTS idx_users_tenant_role_active ON public.users (tenant_id, role, is_active);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_user_dates ON public.employee_assignments (user_id, start_date, end_date);

CREATE OR REPLACE FUNCTION public.validate_employee_assignment_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_user_tenant uuid; v_user_active boolean; v_accommodation_tenant uuid;
BEGIN
 SELECT tenant_id,is_active INTO v_user_tenant,v_user_active FROM public.users WHERE id=NEW.user_id;
 SELECT tenant_id INTO v_accommodation_tenant FROM public.accommodations WHERE id=NEW.accommodation_id;
 IF v_user_tenant IS NULL OR v_accommodation_tenant IS NULL THEN RAISE EXCEPTION 'INTEGRITY_ERROR: Utilisateur ou établissement introuvable'; END IF;
 IF v_user_tenant IS DISTINCT FROM v_accommodation_tenant THEN RAISE EXCEPTION 'INTEGRITY_ERROR: Affectation inter-tenant interdite'; END IF;
 IF NOT v_user_active THEN RAISE EXCEPTION 'INTEGRITY_ERROR: Un utilisateur inactif ne peut pas être affecté'; END IF;
 RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_employee_assignment_integrity ON public.employee_assignments;
CREATE TRIGGER trg_validate_employee_assignment_integrity BEFORE INSERT OR UPDATE OF user_id,accommodation_id ON public.employee_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_employee_assignment_integrity();
REVOKE ALL ON FUNCTION public.validate_employee_assignment_integrity() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_employee_assignment_integrity() TO service_role;

DROP POLICY IF EXISTS accommodations_select_own_tenant ON public.accommodations;
CREATE POLICY accommodations_select_own_tenant ON public.accommodations FOR SELECT TO authenticated USING (tenant_id=(select public.get_current_user_tenant_id()) OR public.is_super_admin());
DROP POLICY IF EXISTS accommodations_insert_admin ON public.accommodations;
CREATE POLICY accommodations_insert_admin ON public.accommodations FOR INSERT TO authenticated WITH CHECK ((tenant_id=(select public.get_current_user_tenant_id()) AND public.get_current_user_role()='admin_residence') OR public.is_super_admin());
DROP POLICY IF EXISTS accommodations_update_admin ON public.accommodations;
CREATE POLICY accommodations_update_admin ON public.accommodations FOR UPDATE TO authenticated USING ((tenant_id=(select public.get_current_user_tenant_id()) AND public.get_current_user_role()='admin_residence') OR public.is_super_admin()) WITH CHECK ((tenant_id=(select public.get_current_user_tenant_id()) AND public.get_current_user_role()='admin_residence') OR public.is_super_admin());
DROP POLICY IF EXISTS accommodations_delete_admin ON public.accommodations;
CREATE POLICY accommodations_delete_admin ON public.accommodations FOR DELETE TO authenticated USING ((tenant_id=(select public.get_current_user_tenant_id()) AND public.get_current_user_role()='admin_residence') OR public.is_super_admin());

DROP POLICY IF EXISTS users_select_same_tenant ON public.users;
DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_same_tenant ON public.users FOR SELECT TO authenticated USING (tenant_id=(select public.get_current_user_tenant_id()) OR auth_user_id=(select auth.uid()) OR public.is_super_admin());
DROP POLICY IF EXISTS users_update_admin ON public.users;
CREATE POLICY users_update_admin ON public.users FOR UPDATE TO authenticated USING ((tenant_id=(select public.get_current_user_tenant_id()) AND public.get_current_user_role()='admin_residence') OR auth_user_id=(select auth.uid()) OR public.is_super_admin()) WITH CHECK ((tenant_id=(select public.get_current_user_tenant_id()) AND public.get_current_user_role()='admin_residence') OR auth_user_id=(select auth.uid()) OR public.is_super_admin());
DROP POLICY IF EXISTS users_delete_admin ON public.users;
CREATE POLICY users_delete_admin ON public.users FOR DELETE TO authenticated USING ((tenant_id=(select public.get_current_user_tenant_id()) AND public.get_current_user_role()='admin_residence') OR public.is_super_admin());

DROP POLICY IF EXISTS employee_assignments_select ON public.employee_assignments;
CREATE POLICY employee_assignments_select ON public.employee_assignments FOR SELECT TO authenticated USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id=employee_assignments.user_id AND u.tenant_id=(select public.get_current_user_tenant_id())));
DROP POLICY IF EXISTS employee_assignments_insert ON public.employee_assignments;
CREATE POLICY employee_assignments_insert ON public.employee_assignments FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR (public.get_current_user_role()='admin_residence' AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=employee_assignments.user_id AND u.tenant_id=(select public.get_current_user_tenant_id())) AND EXISTS (SELECT 1 FROM public.accommodations a WHERE a.id=employee_assignments.accommodation_id AND a.tenant_id=(select public.get_current_user_tenant_id()))));
DROP POLICY IF EXISTS employee_assignments_update ON public.employee_assignments;
CREATE POLICY employee_assignments_update ON public.employee_assignments FOR UPDATE TO authenticated USING (public.is_super_admin() OR (public.get_current_user_role()='admin_residence' AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=employee_assignments.user_id AND u.tenant_id=(select public.get_current_user_tenant_id())))) WITH CHECK (public.is_super_admin() OR (public.get_current_user_role()='admin_residence' AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=employee_assignments.user_id AND u.tenant_id=(select public.get_current_user_tenant_id())) AND EXISTS (SELECT 1 FROM public.accommodations a WHERE a.id=employee_assignments.accommodation_id AND a.tenant_id=(select public.get_current_user_tenant_id()))));
DROP POLICY IF EXISTS employee_assignments_delete ON public.employee_assignments;
CREATE POLICY employee_assignments_delete ON public.employee_assignments FOR DELETE TO authenticated USING (public.is_super_admin() OR (public.get_current_user_role()='admin_residence' AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=employee_assignments.user_id AND u.tenant_id=(select public.get_current_user_tenant_id()))));
