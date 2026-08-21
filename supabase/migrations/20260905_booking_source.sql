-- ============================================================================
-- Migration : ajout de booking_source sur bookings
-- ============================================================================
-- Permet de tracer l'origine d'une réservation :
--   'manual'       créée par la réceptionniste depuis le dashboard
--   'external'     créée via un portail externe (ex: Trouvetou)
--   'client_request' créée depuis l'espace client

-- 1. Nouveau type dédié
DO $$ BEGIN
  CREATE TYPE booking_source AS ENUM ('manual', 'external', 'client_request');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Colonne sur bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_source booking_source NOT NULL DEFAULT 'manual';

-- 3. Mise à jour de la fonction create_booking pour accepter la source
DROP FUNCTION IF EXISTS create_booking(
  UUID, UUID, UUID, UUID, DATE, DATE, INTEGER, INTEGER, INTEGER, INTEGER, UUID, TIME, TIME, INTEGER, TEXT
);
DROP FUNCTION IF EXISTS create_booking(
  UUID, UUID, UUID, UUID, DATE, DATE, INTEGER, INTEGER, INTEGER, INTEGER, UUID, TIME, TIME, INTEGER, TEXT, booking_status
);

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
  p_initial_status booking_status DEFAULT 'confirmed'
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
    number_of_guests, special_requests, created_by, status, booking_source
  ) VALUES (
    p_tenant_id, p_accommodation_id, p_room_id, p_client_id,
    v_code, p_check_in_date, p_check_out_date,
    p_check_in_time, v_check_out_time,
    p_base_price, p_negotiated_price, p_nights_count, p_total_amount,
    p_number_of_guests, p_special_requests, p_created_by, p_initial_status, p_booking_source
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
