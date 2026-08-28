-- ============================================================================
-- Migration : durcissement du check-in pour réservations tiers
-- Bloque l'arrivée si l'ID de l'occupant n'est pas enregistré
-- ============================================================================

CREATE OR REPLACE FUNCTION check_in_booking(
  p_booking_id UUID,
  p_user_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id AND status = 'confirmed' FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECK_IN_FAILED: Réservation introuvable ou déjà arrivée';
  END IF;

  -- Bloquer le check-in si réservation tiers avec ID occupant en attente
  IF v_booking.is_third_party AND v_booking.id_registration_status = 'pending' THEN
    RAISE EXCEPTION 'PENDING_ID: ID de l''occupant non enregistré. Veuillez scanner ou saisir les pièces d''identité avant de procéder.';
  END IF;

  IF CURRENT_DATE < v_booking.check_in_date THEN
    RAISE EXCEPTION 'EARLY_ARRIVAL: Arrivée anticipée — le check-in est prévu le %. Utilisez « Modifier » pour avancer les dates de la réservation.',
      to_char(v_booking.check_in_date, 'DD/MM/YYYY');
  END IF;

  IF CURRENT_DATE >= v_booking.check_out_date THEN
    RAISE EXCEPTION 'LATE_ARRIVAL: La date de séjour est dépassée. Utilisez « Prolonger » pour étendre le séjour ou créez une nouvelle réservation.';
  END IF;

  UPDATE bookings
  SET status = 'checked_in',
      actual_check_in = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- Journal d'audit
  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (v_booking.tenant_id, 'check_in', 'booking', v_booking.id,
    jsonb_build_object('actual_check_in', v_booking.actual_check_in), NOW());

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
