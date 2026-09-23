-- Phase 10: fix booking cancellation for the actual room status enum.
-- The current room_status enum has no maintenance/out_of_service values.
-- Cancellation now releases a non-checked-in room only when its current status is available/occupied/cleaning.
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_user_id uuid, p_reason text DEFAULT NULL::text)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_was_checked_in boolean := false;
  v_checkout_ts timestamp;
BEGIN
  PERFORM public.assert_current_user_can_access_booking(p_booking_id, p_user_id);

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND status IN ('confirmed', 'checked_in')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCEL_FAILED: Réservation introuvable ou déjà terminée';
  END IF;

  v_was_checked_in := v_booking.status = 'checked_in';

  UPDATE public.bookings SET status = 'cancelled'
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

    UPDATE public.rooms SET status = 'cleaning'
    WHERE id = v_booking.room_id;
  ELSE
    UPDATE public.rooms
    SET status = 'available'
    WHERE id = v_booking.room_id
      AND status IN ('available', 'occupied', 'cleaning');
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
$$;
