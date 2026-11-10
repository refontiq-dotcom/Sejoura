-- Allow authenticated partner integrations to cancel bookings safely.
-- This RPC is intentionally restricted to service_role; the HTTP route
-- authenticates the partner secret/API key and supplies an active tenant admin.

CREATE OR REPLACE FUNCTION public.cancel_booking_external(
  p_booking_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_booking public.bookings;
  v_user_tenant uuid;
  v_user_role public.user_role;
  v_user_active boolean;
  v_was_checked_in boolean := false;
  v_checkout_ts timestamp;
BEGIN
  SELECT tenant_id, role, is_active
    INTO v_user_tenant, v_user_role, v_user_active
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND
     OR NOT COALESCE(v_user_active, false)
     OR v_user_role NOT IN ('admin_residence', 'receptionniste') THEN
    RAISE EXCEPTION 'FORBIDDEN: Utilisateur externe invalide pour cette annulation';
  END IF;

  SELECT *
    INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND tenant_id = v_user_tenant
    AND status IN ('confirmed', 'checked_in')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCEL_FAILED: Réservation introuvable ou déjà terminée';
  END IF;

  v_was_checked_in := v_booking.status = 'checked_in';

  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  IF v_was_checked_in THEN
    v_checkout_ts := COALESCE(v_booking.actual_check_out, NOW());

    INSERT INTO public.cleaning_tasks (
      tenant_id, accommodation_id, room_id, booking_id, status,
      checkout_time, alert_time, force_release_time, priority, notes, created_at
    ) VALUES (
      v_booking.tenant_id, v_booking.accommodation_id, v_booking.room_id,
      v_booking.id, 'pending', v_checkout_ts,
      v_checkout_ts + INTERVAL '1 hour 30 minutes',
      v_checkout_ts + INTERVAL '2 hours', 10,
      'Annulation après check-in — chambre à remettre en état', NOW()
    );

    UPDATE public.rooms
    SET status = 'cleaning'
    WHERE id = v_booking.room_id;
  ELSE
    UPDATE public.rooms
    SET status = 'available'
    WHERE id = v_booking.room_id
      AND status IN ('available', 'occupied', 'cleaning');
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, entity_type, entity_id, new_values, created_at
  ) VALUES (
    v_booking.tenant_id, p_user_id, 'booking_cancelled', 'booking',
    v_booking.id,
    jsonb_build_object('reason', p_reason, 'was_checked_in', v_was_checked_in),
    NOW()
  );

  RETURN v_booking;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_booking_external(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking_external(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_external(uuid, uuid, text) TO service_role;
