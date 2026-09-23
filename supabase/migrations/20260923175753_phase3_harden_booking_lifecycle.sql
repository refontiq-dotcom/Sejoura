-- Phase 3 P0/P1: harden booking lifecycle.
-- The existing no_double_booking EXCLUDE constraint is retained and verified;
-- it already prevents overlapping active reservations.

CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking public.bookings;
  v_was_checked_in boolean := false;
  v_checkout_ts timestamp;
BEGIN
  PERFORM public.assert_current_user_can_access_booking(p_booking_id, p_user_id);

  SELECT *
    INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
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
      tenant_id, accommodation_id, room_id, booking_id,
      status, checkout_time, alert_time, force_release_time,
      priority, notes, created_at
    )
    VALUES (
      v_booking.tenant_id, v_booking.accommodation_id, v_booking.room_id, v_booking.id,
      'pending', v_checkout_ts,
      v_checkout_ts + INTERVAL '1 hour 30 minutes',
      v_checkout_ts + INTERVAL '2 hours',
      10,
      'Annulation après check-in — chambre à remettre en état',
      NOW()
    );

    UPDATE public.rooms
    SET status = 'cleaning'
    WHERE id = v_booking.room_id;
  ELSE
    UPDATE public.rooms
    SET status = 'available'
    WHERE id = v_booking.room_id
      AND status NOT IN ('maintenance', 'out_of_service');
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, entity_type, entity_id, new_values, created_at
  )
  VALUES (
    v_booking.tenant_id, p_user_id, 'booking_cancelled', 'booking', v_booking.id,
    jsonb_build_object('reason', p_reason, 'was_checked_in', v_was_checked_in),
    NOW()
  );

  RETURN v_booking;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_in_booking(
  p_booking_id uuid,
  p_user_id uuid,
  p_allow_early boolean DEFAULT false,
  p_allow_late boolean DEFAULT false
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking public.bookings;
  v_room_status text;
BEGIN
  PERFORM public.assert_current_user_can_access_booking(p_booking_id, p_user_id);

  SELECT *
    INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND status = 'confirmed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECK_IN_FAILED: Réservation introuvable ou déjà arrivée';
  END IF;

  IF v_booking.is_third_party AND v_booking.id_registration_status = 'pending' THEN
    RAISE EXCEPTION 'PENDING_ID: ID de l''occupant non enregistré. Veuillez scanner ou saisir les pièces d''identité avant de procéder.';
  END IF;

  IF NOT p_allow_early AND NOW()::date < v_booking.check_in_date THEN
    RAISE EXCEPTION 'EARLY_CHECK_IN: Arrivée anticipée — le check-in est prévu le % (dans % jour(s)). Utilisez « Modifier / Prolonger » pour avancer la date d''arrivée.',
      to_char(v_booking.check_in_date, 'DD/MM/YYYY'),
      (v_booking.check_in_date - NOW()::date);
  END IF;

  IF NOT p_allow_late
     AND NOW() > (v_booking.check_out_date + COALESCE(v_booking.check_out_time, '11:00'::time))::timestamp THEN
    RAISE EXCEPTION 'LATE_CHECK_IN: Le séjour est terminé depuis le % à %. Prolongez la réservation avec « Modifier / Prolonger » ou créez-en une nouvelle.',
      to_char(v_booking.check_out_date, 'DD/MM/YYYY'),
      to_char(COALESCE(v_booking.check_out_time, '11:00'::time), 'HH24:MI');
  END IF;

  SELECT status::text
    INTO v_room_status
  FROM public.rooms
  WHERE id = v_booking.room_id
  FOR UPDATE;

  IF v_room_status IS NULL THEN
    RAISE EXCEPTION 'CHECK_IN_FAILED: Chambre introuvable';
  END IF;

  IF v_room_status NOT IN ('available') THEN
    RAISE EXCEPTION 'ROOM_NOT_READY: La chambre n''est pas disponible pour le check-in (statut actuel : %).', v_room_status;
  END IF;

  UPDATE public.bookings
  SET status = 'checked_in',
      actual_check_in = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, entity_type, entity_id, new_values, created_at
  )
  VALUES (
    v_booking.tenant_id, p_user_id, 'check_in', 'booking', v_booking.id,
    jsonb_build_object('actual_check_in', v_booking.actual_check_in),
    NOW()
  );

  RETURN v_booking;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_booking(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_in_booking(uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_booking(uuid, uuid, boolean, boolean) TO authenticated, service_role;
