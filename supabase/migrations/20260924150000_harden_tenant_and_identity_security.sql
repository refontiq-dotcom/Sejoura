-- Harden tenant isolation and identity helpers.
-- Applied to production Supabase on 2026-09-24.
CREATE OR REPLACE FUNCTION public.is_tenant_locked(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_locked boolean;
  v_current_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Connexion requise';
  END IF;

  v_current_tenant := public.get_current_user_tenant_id();

  IF v_current_tenant IS NULL OR p_tenant_id IS DISTINCT FROM v_current_tenant THEN
    RAISE EXCEPTION 'FORBIDDEN: Tenant hors périmètre';
  END IF;

  SELECT s.is_soft_locked INTO v_locked
  FROM public.subscriptions s
  WHERE s.tenant_id = p_tenant_id;

  RETURN COALESCE(v_locked, false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_tenant_locked(uuid) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.reopen_cleaning_task(p_task_id uuid)
RETURNS public.cleaning_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_task public.cleaning_tasks;
  v_user_tenant uuid;
BEGIN
  IF public.get_current_user_role() <> 'menagere'::public.user_role THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seules les ménagères peuvent relancer une tâche';
  END IF;

  v_user_tenant := public.get_current_user_tenant_id();

  SELECT * INTO v_task
  FROM public.cleaning_tasks
  WHERE id = p_task_id
    AND tenant_id = v_user_tenant
    AND status = 'expired'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.cleaning_tasks
  SET status = 'pending',
      claimed_by = NULL,
      claimed_at = NULL,
      completed_by = NULL,
      completed_at = NULL,
      is_alert_sent = FALSE,
      is_force_released = FALSE,
      alert_time = NOW() + INTERVAL '1 hour 30 minutes',
      force_release_time = NOW() + INTERVAL '2 hours'
  WHERE id = p_task_id AND tenant_id = v_user_tenant
  RETURNING * INTO v_task;

  UPDATE public.rooms
  SET status = 'cleaning'
  WHERE id = v_task.room_id
    AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = v_task.room_id
        AND EXISTS (
          SELECT 1 FROM public.accommodations a
          WHERE a.id = r.accommodation_id AND a.tenant_id = v_user_tenant
        )
    );

  RETURN v_task;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_role public.user_role;
BEGIN
  SELECT u.role INTO v_role FROM public.users u
  WHERE u.auth_user_id = auth.uid() AND u.is_active = true;
  RETURN v_role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT u.tenant_id INTO v_tenant_id FROM public.users u
  WHERE u.auth_user_id = auth.uid() AND u.is_active = true;
  RETURN v_tenant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_assigned_accommodation_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT u.accommodation_id FROM public.users u
  WHERE u.id = public.get_current_user_id() AND u.is_active = true LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.is_active = true
      AND u.role = 'super_admin'::public.user_role
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_tenant_locked(uuid) FROM anon, authenticated, public;
