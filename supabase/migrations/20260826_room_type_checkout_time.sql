-- 20260826_room_type_checkout_time.sql
-- Heure de sortie par type de chambre, synchronisée avec les réservations.
--
-- Contexte : chaque résidence a ses propres conditions. L'heure de départ
-- (check-out) d'une réservation doit être définie au niveau du TYPE de chambre
-- (ex: Suite = 12:00, Studio = 11:00) plutôt que globalement à 11:00.
--
-- 1. Nouvelle colonne room_types.check_out_time (défaut 11:00, rétrocompatible)
-- 2. create_booking() résout automatiquement l'heure de sortie depuis le type
--    de chambre lorsque aucune heure explicite n'est fournie : chaque nouvelle
--    réservation est donc synchronisée avec la condition de son type de chambre
--    (la valeur est copiée dans bookings.check_out_time comme instantané).
--    Les systèmes qui s'appuient déjà sur check_overstays() bénéficient
--    automatiquement de l'heure spécifique au type. Idempotent.

-- ----------------------------------------------------------------------------
-- 1. HEURE DE SORTIE PAR DÉFAUT DU TYPE DE CHAMBRE
-- ----------------------------------------------------------------------------
ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS check_out_time TIME NOT NULL DEFAULT '11:00';

-- ----------------------------------------------------------------------------
-- 2. create_booking(): synchronisation intelligente avec le type de chambre
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
  p_check_out_time TIME DEFAULT NULL,
  p_number_of_guests INTEGER DEFAULT 1,
  p_special_requests TEXT DEFAULT NULL
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_code TEXT;
  v_is_available BOOLEAN;
  v_check_out_time TIME;
BEGIN
  -- Vérifier anti double-booking
  SELECT check_double_booking(p_room_id, p_check_in_date, p_check_out_date) INTO v_is_available;

  IF NOT v_is_available THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: Cette chambre est déjà réservée pour ces dates';
  END IF;

  -- Heure de sortie : celle du type de chambre de la chambre réservée par
  -- défaut, sinon une heure explicite, sinon 11:00 (rétrocompatibilité).
  SELECT COALESCE(
    p_check_out_time,
    (SELECT rt.check_out_time
     FROM rooms r
     JOIN room_types rt ON rt.id = r.room_type_id
     WHERE r.id = p_room_id),
    TIME '11:00'
  ) INTO v_check_out_time;

  -- Générer le code de réservation
  SELECT generate_booking_code(p_tenant_id) INTO v_code;

  -- Créer la réservation (instantané de l'heure de sortie dans la réservation)
  INSERT INTO bookings (
    tenant_id, accommodation_id, room_id, client_id,
    booking_code, check_in_date, check_out_date,
    check_in_time, check_out_time,
    base_price, negotiated_price, nights_count, total_amount,
    number_of_guests, special_requests, created_by
  ) VALUES (
    p_tenant_id, p_accommodation_id, p_room_id, p_client_id,
    v_code, p_check_in_date, p_check_out_date,
    p_check_in_time, v_check_out_time,
    p_base_price, p_negotiated_price, p_nights_count, p_total_amount,
    p_number_of_guests, p_special_requests, p_created_by
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
