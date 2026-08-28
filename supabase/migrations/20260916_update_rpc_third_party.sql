-- ============================================================================
-- Migration : mise à jour des RPC create_booking et update_booking
-- pour supporter les réservations tiers (séparation payeur / occupant)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Purge complète de toutes les surcharges existantes de create_booking
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p
    WHERE p.proname = 'create_booking'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proname || '(' || r.args || ') CASCADE';
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Création de create_booking avec support tiers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_booking(
  p_tenant_id UUID,
  p_accommodation_id UUID,
  p_room_id UUID,
  p_client_id UUID,
  p_check_in_date DATE,
  p_check_out_date DATE,
  p_base_price INTEGER,
  p_negotiated_price INTEGER,
  p_nights_count INTEGER,
  p_total_amount INTEGER,
  p_created_by UUID,
  p_check_in_time TIME DEFAULT '14:00',
  p_check_out_time TIME DEFAULT '11:00',
  p_number_of_guests INTEGER DEFAULT 1,
  p_special_requests TEXT DEFAULT NULL,
  p_booking_source booking_source DEFAULT 'manual',
  p_initial_status booking_status DEFAULT 'confirmed',
  p_is_third_party BOOLEAN DEFAULT FALSE,
  p_occupant_full_name TEXT DEFAULT NULL,
  p_occupant_phone TEXT DEFAULT NULL,
  p_occupant_id_type TEXT DEFAULT NULL,
  p_occupant_id_number TEXT DEFAULT NULL,
  p_occupant_nationality TEXT DEFAULT NULL,
  p_occupant_address TEXT DEFAULT NULL,
  p_id_registration_status TEXT DEFAULT 'not_required'
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_code TEXT;
  v_is_available BOOLEAN;
  v_check_out_time TIME;
BEGIN
  SELECT check_double_booking(p_room_id, p_check_in_date, p_check_out_date) INTO v_is_available;

  IF NOT v_is_available THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: Cette chambre est déjà réservée pour ces dates';
  END IF;

  SELECT COALESCE(
    p_check_out_time,
    (SELECT rt.check_out_time
     FROM rooms r
     JOIN room_types rt ON rt.id = r.room_type_id
     WHERE r.id = p_room_id),
    TIME '11:00'
  ) INTO v_check_out_time;

  SELECT generate_booking_code(p_tenant_id) INTO v_code;

  INSERT INTO bookings (
    tenant_id, accommodation_id, room_id, client_id,
    booking_code, check_in_date, check_out_date,
    check_in_time, check_out_time,
    base_price, negotiated_price, nights_count, total_amount,
    number_of_guests, special_requests, created_by, status, booking_source,
    is_third_party, occupant_full_name, occupant_phone, occupant_id_type,
    occupant_id_number, occupant_nationality,
    occupant_address, id_registration_status
  ) VALUES (
    p_tenant_id, p_accommodation_id, p_room_id, p_client_id,
    v_code, p_check_in_date, p_check_out_date,
    p_check_in_time, v_check_out_time,
    p_base_price, p_negotiated_price, p_nights_count, p_total_amount,
    p_number_of_guests, p_special_requests, p_created_by, p_initial_status, p_booking_source,
    p_is_third_party, p_occupant_full_name, p_occupant_phone, p_occupant_id_type,
    p_occupant_id_number, p_occupant_nationality,
    p_occupant_address, p_id_registration_status
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. Mise à jour de update_booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_booking(
  p_booking_id UUID,
  p_user_id UUID,
  p_check_in_date DATE DEFAULT NULL,
  p_check_out_date DATE DEFAULT NULL,
  p_room_id UUID DEFAULT NULL,
  p_negotiated_price INTEGER DEFAULT NULL,
  p_is_third_party BOOLEAN DEFAULT NULL,
  p_occupant_full_name TEXT DEFAULT NULL,
  p_occupant_phone TEXT DEFAULT NULL,
  p_occupant_id_type TEXT DEFAULT NULL,
  p_occupant_id_number TEXT DEFAULT NULL,
  p_occupant_nationality TEXT DEFAULT NULL,
  p_occupant_address TEXT DEFAULT NULL,
  p_id_registration_status TEXT DEFAULT NULL
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_new_check_in DATE;
  v_new_check_out DATE;
  v_new_room UUID;
  v_new_price INTEGER;
  v_nights INTEGER;
  v_available BOOLEAN;
  v_old_room UUID;
  v_old_values JSONB;
  v_new_values JSONB;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UPDATE_BOOKING_FAILED: Réservation introuvable';
  END IF;

  IF v_booking.status NOT IN ('confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'UPDATE_BOOKING_FAILED: Une réservation au statut "%" ne peut pas être modifiée', v_booking.status;
  END IF;

  IF p_is_third_party IS DISTINCT FROM v_booking.is_third_party
     AND v_booking.status IN ('checked_in', 'checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'UPDATE_BOOKING_FAILED: Cannot change third-party status after check-in';
  END IF;

  IF COALESCE(p_id_registration_status, v_booking.id_registration_status) = 'registered'
     AND (COALESCE(p_occupant_id_type, v_booking.occupant_id_type) IS NULL OR COALESCE(p_occupant_id_number, v_booking.occupant_id_number) IS NULL) THEN
    RAISE EXCEPTION 'UPDATE_BOOKING_FAILED: ID occupant requis pour marquer l''enregistrement comme validé';
  END IF;

  v_old_room := v_booking.room_id;
  v_new_check_in   := COALESCE(p_check_in_date, v_booking.check_in_date);
  v_new_check_out  := COALESCE(p_check_out_date, v_booking.check_out_date);
  v_new_room       := COALESCE(p_room_id, v_booking.room_id);
  v_new_price      := COALESCE(p_negotiated_price, v_booking.negotiated_price);

  IF v_booking.status = 'checked_in' AND v_new_check_in <> v_booking.check_in_date THEN
    RAISE EXCEPTION 'CHECKED_IN: La date d''arrivée ne peut plus être modifiée une fois le client installé';
  END IF;

  IF v_new_check_out <= v_new_check_in THEN
    RAISE EXCEPTION 'UPDATE_BOOKING_FAILED: La date de départ doit être après la date d''arrivée';
  END IF;

  IF v_new_price < 0 THEN
    RAISE EXCEPTION 'UPDATE_BOOKING_FAILED: Le prix ne peut pas être négatif';
  END IF;

  v_nights := v_new_check_out - v_new_check_in;

  SELECT check_double_booking(v_new_room, v_new_check_in, v_new_check_out, p_booking_id) INTO v_available;
  IF NOT v_available THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: Cette chambre est déjà réservée pour ces dates';
  END IF;

  IF v_booking.status = 'checked_in' AND v_new_room <> v_old_room THEN
    PERFORM 1 FROM rooms r WHERE r.id = v_new_room AND r.status <> 'available';
    IF FOUND THEN
      RAISE EXCEPTION 'UPDATE_BOOKING_FAILED: La chambre de destination est actuellement occupée, en alerte ou en nettoyage';
    END IF;
  END IF;

  v_old_values := jsonb_build_object(
    'check_in_date', v_booking.check_in_date,
    'check_out_date', v_booking.check_out_date,
    'room_id', v_booking.room_id,
    'negotiated_price', v_booking.negotiated_price,
    'nights_count', v_booking.nights_count,
    'total_amount', v_booking.total_amount,
    'is_third_party', v_booking.is_third_party,
    'occupant_full_name', v_booking.occupant_full_name,
    'occupant_phone', v_booking.occupant_phone,
    'occupant_id_type', v_booking.occupant_id_type,
    'occupant_id_number', v_booking.occupant_id_number,
    'occupant_nationality', v_booking.occupant_nationality,
    'occupant_address', v_booking.occupant_address,
    'id_registration_status', v_booking.id_registration_status
  );

  UPDATE bookings
  SET check_in_date      = v_new_check_in,
      check_out_date     = v_new_check_out,
      room_id            = v_new_room,
      negotiated_price   = v_new_price,
      nights_count       = v_nights,
      total_amount       = v_new_price * v_nights,
      payment_status     = CASE
        WHEN amount_paid >= v_new_price * v_nights THEN 'paid'::payment_status
        WHEN amount_paid > 0 THEN 'partial'::payment_status
        ELSE 'unpaid'::payment_status
      END,
      is_overstay        = FALSE,
      overstay_detected_at = NULL,
      is_third_party = COALESCE(p_is_third_party, is_third_party),
      occupant_full_name = COALESCE(p_occupant_full_name, occupant_full_name),
      occupant_phone = COALESCE(p_occupant_phone, occupant_phone),
      occupant_id_type = COALESCE(p_occupant_id_type, occupant_id_type),
      occupant_id_number = COALESCE(p_occupant_id_number, occupant_id_number),
      occupant_nationality = COALESCE(p_occupant_nationality, occupant_nationality),
      occupant_address = COALESCE(p_occupant_address, occupant_address),
      id_registration_status = COALESCE(p_id_registration_status, id_registration_status)
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  IF v_booking.status = 'checked_in' AND v_new_room <> v_old_room THEN
    UPDATE rooms SET status = 'occupied' WHERE id = v_new_room;
    UPDATE rooms SET status = 'available'
    WHERE id = v_old_room
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.room_id = v_old_room AND b.status = 'checked_in' AND b.id <> p_booking_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM cleaning_tasks c
        WHERE c.room_id = v_old_room AND c.status IN ('pending', 'claimed', 'in_progress')
      );
  END IF;

  v_new_values := jsonb_build_object(
    'check_in_date', v_booking.check_in_date,
    'check_out_date', v_booking.check_out_date,
    'room_id', v_booking.room_id,
    'negotiated_price', v_booking.negotiated_price,
    'nights_count', v_booking.nights_count,
    'total_amount', v_booking.total_amount,
    'is_third_party', v_booking.is_third_party,
    'occupant_full_name', v_booking.occupant_full_name,
    'occupant_phone', v_booking.occupant_phone,
    'occupant_id_type', v_booking.occupant_id_type,
    'occupant_id_number', v_booking.occupant_id_number,
    'occupant_nationality', v_booking.occupant_nationality,
    'occupant_address', v_booking.occupant_address,
    'id_registration_status', v_booking.id_registration_status
  );

  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at)
  VALUES (v_booking.tenant_id, p_user_id, 'booking_modified', 'booking', v_booking.id, v_old_values, v_new_values, NOW());

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
