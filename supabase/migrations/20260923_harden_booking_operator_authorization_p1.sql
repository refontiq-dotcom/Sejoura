-- Phase 1 P1: require an authenticated booking operator for booking state changes.
CREATE OR REPLACE FUNCTION public.assert_booking_operator(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  PERFORM public.assert_current_user(p_user_id);
  SELECT role INTO v_role FROM public.users WHERE id = p_user_id AND auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('super_admin'::public.user_role, 'admin_residence'::public.user_role, 'receptionniste'::public.user_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: Ce rôle ne peut pas effectuer cette opération';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.assert_booking_operator(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_booking_operator(uuid) TO service_role;

DO $$
DECLARE r record; ddl text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.oid::regprocedure::text IN (
    'public.cancel_booking(uuid,uuid,text)','public.check_in_booking(uuid,uuid,boolean,boolean)',
    'public.check_in_booking(uuid,uuid)','public.check_out_booking(uuid,uuid)','public.extend_booking(uuid,date,uuid)',
    'public.mark_no_show(uuid,uuid)','public.generate_invoice(uuid,uuid,text)',
    'public.update_booking(uuid,uuid,date,date,integer,text,integer,text,text)',
    'public.update_booking(uuid,uuid,date,date,uuid,integer,boolean,text,text,text,text,text,text,text)',
    'public.update_booking(uuid,uuid,date,date,uuid,integer)'
  ) LOOP
    ddl := pg_get_functiondef(r.oid);
    ddl := replace(ddl,
      'PERFORM public.assert_current_user_can_access_booking(p_booking_id, p_user_id);',
      'PERFORM public.assert_current_user_can_access_booking(p_booking_id, p_user_id);\n  PERFORM public.assert_booking_operator(p_user_id);');
    EXECUTE ddl;
  END LOOP;
END $$;