-- Phase 3 P0: remove the legacy check-in path that bypassed room readiness checks.

CREATE OR REPLACE FUNCTION public.check_in_booking(
  p_booking_id uuid,
  p_user_id uuid
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.check_in_booking(p_booking_id, p_user_id, false, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.check_in_booking(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_booking(uuid, uuid) TO authenticated, service_role;
