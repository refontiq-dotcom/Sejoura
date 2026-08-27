-- ============================================================================
-- Migration : corriger les notifications auto-générées par le personnel
-- ============================================================================
-- Contexte : un réceptionniste / admin reçoit sa propre notification
-- quand il prolonge un séjour (extend_booking) ou traite une demande
-- de prolongation (process_stay_extension).
--
-- Cause : create_system_notification() est appelé sans le 8e paramètre
-- p_created_by, donc la notification est insérée avec created_by = NULL.
-- Le filtre côté header.tsx n'exclut pas les notifs avec created_by NULL,
-- donc l'acteur se voit lui-même.
--
-- Fix : transmettre p_user_id comme p_created_by dans les 2 RPC.

-- 1. extend_booking()
CREATE OR REPLACE FUNCTION extend_booking(
  p_booking_id UUID,
  p_new_check_out_date DATE,
  p_user_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_is_available BOOLEAN;
  v_new_nights INTEGER;
  v_new_total INTEGER;
  v_extra_nights INTEGER;
  v_old_check_out DATE;
BEGIN
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id AND status IN ('confirmed', 'checked_in')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE: Réservation introuvable ou non active';
  END IF;

  IF p_new_check_out_date <= v_booking.check_in_date THEN
    RAISE EXCEPTION 'INVALID_CHECK_OUT: La nouvelle date de départ doit être après la date d''arrivée';
  END IF;

  SELECT check_double_booking(v_booking.room_id, v_booking.check_in_date, p_new_check_out_date, p_booking_id)
  INTO v_is_available;

  IF NOT v_is_available THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: La chambre est déjà réservée sur la période prolongée';
  END IF;

  v_extra_nights := p_new_check_out_date - v_booking.check_out_date;
  v_old_check_out := v_booking.check_out_date;
  v_new_nights := (p_new_check_out_date - v_booking.check_in_date);
  v_new_total := v_booking.negotiated_price * v_new_nights;

  UPDATE bookings
  SET check_out_date = p_new_check_out_date,
      nights_count = v_new_nights,
      total_amount = v_new_total,
      payment_status = CASE
        WHEN amount_paid >= v_new_total THEN 'paid'::payment_status
        WHEN amount_paid > 0 THEN 'partial'::payment_status
        ELSE 'unpaid'::payment_status
      END,
      is_overstay = FALSE,
      overstay_detected_at = NULL
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  IF v_extra_nights > 0 THEN
    INSERT INTO booking_extensions (
      tenant_id, booking_id, previous_check_out_date, new_check_out_date,
      extra_nights, source, created_by
    )
    VALUES (
      v_booking.tenant_id, p_booking_id, v_old_check_out, p_new_check_out_date,
      v_extra_nights, 'manual', p_user_id
    );
  END IF;

  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (v_booking.tenant_id, 'booking_extended', 'booking', v_booking.id,
    jsonb_build_object(
      'check_out_date', v_booking.check_out_date,
      'nights_count', v_booking.nights_count,
      'total_amount', v_booking.total_amount,
      'extended_by', p_user_id
    ),
    NOW());

  PERFORM create_system_notification(
    v_booking.tenant_id,
    NULL,
    'Séjour prolongé',
    'Chambre ' || COALESCE((SELECT room_number FROM rooms WHERE id = v_booking.room_id), '') ||
      ' · départ reporté au ' || to_char(v_booking.check_out_date, 'DD/MM/YYYY') ||
      ' · ' || v_booking.nights_count || ' nuit(s)',
    'success',
    '/dashboard/bookings',
    NULL,
    p_user_id
  );

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. process_stay_extension()
CREATE OR REPLACE FUNCTION process_stay_extension(
  p_request_id UUID,
  p_decision TEXT,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_request stay_extension_requests;
  v_client_name TEXT;
  v_room_number TEXT;
  v_label TEXT;
BEGIN
  SELECT * INTO v_request
  FROM stay_extension_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Demande introuvable');
  END IF;

  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Demande déjà traitée');
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Décision invalide');
  END IF;

  UPDATE stay_extension_requests
  SET status = p_decision,
      processed_by = p_user_id,
      processed_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (v_request.tenant_id, 'stay_extension_' || p_decision, 'stay_extension_request', v_request.id,
    jsonb_build_object(
      'request_id', v_request.id,
      'requested_check_out_date', v_request.requested_check_out_date,
      'processed_by', p_user_id
    ),
    NOW()
  );

  SELECT room_number INTO v_room_number FROM rooms WHERE id =
    (SELECT room_id FROM bookings WHERE id = v_request.booking_id);
  SELECT full_name INTO v_client_name FROM clients WHERE id = v_request.client_id;

  IF p_decision = 'approved' THEN
    v_label := 'Prolongation acceptée';
  ELSE
    v_label := 'Prolongation refusée';
  END IF;

  PERFORM create_system_notification(
    v_request.tenant_id,
    NULL,
    v_label,
    COALESCE(v_client_name, 'Client') || ' · Chambre ' || COALESCE(v_room_number, '') ||
      CASE WHEN p_decision = 'approved'
        THEN ' · demande de départ au ' || to_char(v_request.requested_check_out_date, 'DD/MM/YYYY') || ' acceptée.'
        ELSE ' · demande de départ au ' || to_char(v_request.requested_check_out_date, 'DD/MM/YYYY') || ' refusée.' END,
    CASE WHEN p_decision = 'approved' THEN 'success' ELSE 'warning' END,
    '/dashboard/bookings',
    NULL,
    p_user_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id', v_request.id,
    'status', p_decision
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
