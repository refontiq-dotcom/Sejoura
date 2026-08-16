-- ============================================================================
-- Migration : modification générale de réservation + check-in intelligents
--
--  Complète les fonctionnalités existantes (prolongation via extend_booking,
--  dépassement via check_overstays) par trois apports ciblés, SANS écraser
--  les fonctions du projet :
--
--  1. update_booking : modification générale (dates, chambre, prix) d'une
--     réservation confirmée ou arrivée, avec anti double-booking et recalcul.
--  2. check_in_booking durci : refuse l'arrivée anticipée et l'arrivée après
--     la date de départ, avec messages guidant vers Modifier / Prolonger.
--  3. Trigger ménage : alerte calée sur la prochaine arrivée du même jour.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FONCTION: update_booking — modification générale d'une réservation
--    Modifiable uniquement si 'confirmed' ou 'checked_in'. Recalcule les nuits
--    et le total, vérifie l'anti double-booking (en s'excluant soi-même).
--    Réinitialise le statut de dépassement (cohérent avec extend_booking).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_booking(
  p_booking_id UUID,
  p_user_id UUID,
  p_check_in_date DATE DEFAULT NULL,
  p_check_out_date DATE DEFAULT NULL,
  p_room_id UUID DEFAULT NULL,
  p_negotiated_price INTEGER DEFAULT NULL
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

  v_old_room := v_booking.room_id;
  v_new_check_in   := COALESCE(p_check_in_date, v_booking.check_in_date);
  v_new_check_out  := COALESCE(p_check_out_date, v_booking.check_out_date);
  v_new_room       := COALESCE(p_room_id, v_booking.room_id);
  v_new_price      := COALESCE(p_negotiated_price, v_booking.negotiated_price);

  -- Client déjà installé : la date d'arrivée est verrouillée
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

  -- Anti double-booking (on exclut la réservation en cours de modification)
  SELECT check_double_booking(v_new_room, v_new_check_in, v_new_check_out, p_booking_id) INTO v_available;
  IF NOT v_available THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: Cette chambre est déjà réservée pour ces dates';
  END IF;

  -- Changement de chambre en cours de séjour : la destination doit être libre
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
    'total_amount', v_booking.total_amount
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
      overstay_detected_at = NULL
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- Synchroniser les statuts de chambre en cas de déménagement en cours de séjour
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
    'total_amount', v_booking.total_amount
  );

  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at)
  VALUES (v_booking.tenant_id, p_user_id, 'booking_modified', 'booking', v_booking.id, v_old_values, v_new_values, NOW());

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. FONCTION: check_in_booking — arrivée durcie selon les dates prévues
--    - Arrivée anticipée (avant check_in_date)      -> refus, guide vers "Modifier"
--    - Arrivée après la date de départ              -> refus, guide vers "Prolonger"
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. FONCTION: create_cleaning_task_on_checkout — alerte calée sur la
--    prochaine arrivée du même jour. Si un client attend la chambre le jour du
--    départ, l'alerte et la libération forcée sont ramenées à son heure
--    d'arrivée (priorité 20). Sinon, comportement inchangé (+1h30 / +2h).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_cleaning_task_on_checkout()
RETURNS TRIGGER AS $$
DECLARE
  v_checkout_ts TIMESTAMP;
  v_next_arrival TIMESTAMP;
BEGIN
  IF NEW.status = 'checked_out' AND (OLD.status IS NULL OR OLD.status != 'checked_out') THEN
    v_checkout_ts := COALESCE(NEW.actual_check_out, NOW());

    -- Prochaine arrivée sur la même chambre le jour du départ
    SELECT MIN(check_in_date::timestamp + COALESCE(check_in_time, '14:00')::time)
    INTO v_next_arrival
    FROM bookings b
    WHERE b.room_id = NEW.room_id
      AND b.id <> NEW.id
      AND b.status IN ('confirmed', 'checked_in')
      AND b.check_in_date = NEW.check_out_date;

    IF v_next_arrival IS NOT NULL THEN
      -- Un client attend la chambre : priorité maximale, délais ramenés à l'arrivée
      INSERT INTO cleaning_tasks (
        tenant_id, accommodation_id, room_id, booking_id,
        status, checkout_time, alert_time, force_release_time,
        priority, notes, created_at
      ) VALUES (
        NEW.tenant_id, NEW.accommodation_id, NEW.room_id, NEW.id,
        'pending', v_checkout_ts,
        LEAST(v_checkout_ts + INTERVAL '1 hour 30 minutes', v_next_arrival),
        LEAST(v_checkout_ts + INTERVAL '2 hours', v_next_arrival),
        20,
        'Arrivée prévue à ' || to_char(v_next_arrival, 'HH24:MI') || ' — chambre à préparer en priorité',
        NOW()
      );
    ELSE
      INSERT INTO cleaning_tasks (
        tenant_id, accommodation_id, room_id, booking_id,
        status, checkout_time, alert_time, force_release_time,
        priority, created_at
      ) VALUES (
        NEW.tenant_id, NEW.accommodation_id, NEW.room_id, NEW.id,
        'pending', v_checkout_ts,
        v_checkout_ts + INTERVAL '1 hour 30 minutes',
        v_checkout_ts + INTERVAL '2 hours',
        10,
        NOW()
      );
    END IF;

    -- Mettre la chambre en statut 'cleaning'
    UPDATE rooms SET status = 'cleaning' WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
