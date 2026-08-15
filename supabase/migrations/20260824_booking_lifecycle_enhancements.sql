-- ============================================================================
-- Séjoura — Cycle de vie des réservations
-- Prolongement / modification de réservation, garde-fous de check-in,
-- détection des départs dépassés, ménage priorisé sur la prochaine arrivée.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COLONNES — bookings : détection de départ dépassé (point 2)
--    is_overdue : TRUE dès que NOW() dépasse check_out_date + check_out_time
--    alors que la réservation est toujours 'checked_in'.
-- ----------------------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS overdue_since TIMESTAMPTZ;

COMMENT ON COLUMN bookings.is_overdue IS
  'TRUE si le départ prévu (check_out_date + check_out_time) est dépassé alors que le client est toujours arrivé.';
COMMENT ON COLUMN bookings.overdue_since IS
  'Date/heure à laquelle le départ a été détecté comme dépassé.';

CREATE INDEX IF NOT EXISTS idx_bookings_overdue
  ON bookings(status, is_overdue)
  WHERE (status = 'checked_in' AND is_overdue = TRUE);

-- ----------------------------------------------------------------------------
-- 2. COLONNE — cleaning_tasks : prochaine arrivée connue (point 4)
--    Permet aux ménagères de visualiser l'échéance réelle (arrivée suivante).
-- ----------------------------------------------------------------------------
ALTER TABLE cleaning_tasks
  ADD COLUMN IF NOT EXISTS next_arrival_at TIMESTAMPTZ;

COMMENT ON COLUMN cleaning_tasks.next_arrival_at IS
  'Prochaine arrivée prévue sur la chambre (check_in_date + check_in_time). L''alerte et la libération forcée sont calées sur cette échéance si elle est plus proche que les délais par défaut.';

-- ----------------------------------------------------------------------------
-- 3. GARDE-FOUS CHECK-IN (point 3)
--    Interdit le check-in avant la date d'arrivée prévue (arrivée anticipée)
--    et le check-in après la fin du séjour (trop tard).
--    p_allow_early / p_allow_late permettent de passer outre explicitement
--    (cas particuliers gérés par le réceptionniste).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS check_in_booking(UUID, UUID);

CREATE OR REPLACE FUNCTION check_in_booking(
  p_booking_id UUID,
  p_user_id UUID,
  p_allow_early BOOLEAN DEFAULT FALSE,
  p_allow_late BOOLEAN DEFAULT FALSE
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
BEGIN
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id AND status = 'confirmed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECK_IN_FAILED: Réservation introuvable ou déjà arrivée';
  END IF;

  -- Arrivée anticipée : on est avant le jour d'arrivée prévu
  IF NOT p_allow_early AND NOW()::date < v_booking.check_in_date THEN
    RAISE EXCEPTION 'EARLY_CHECK_IN: Arrivée anticipée — le check-in est prévu le % (dans % jour(s)). Utilisez « Modifier / Prolonger » pour avancer la date d''arrivée.',
      to_char(v_booking.check_in_date, 'DD/MM/YYYY'),
      (v_booking.check_in_date - NOW()::date);
  END IF;

  -- Arrivée trop tardive : le séjour prévu est déjà terminé
  IF NOT p_allow_late
     AND NOW() > (v_booking.check_out_date + COALESCE(v_booking.check_out_time, '11:00'::time))::timestamp THEN
    RAISE EXCEPTION 'LATE_CHECK_IN: Le séjour est terminé depuis le % à %. Prolongez la réservation avec « Modifier / Prolonger » ou créez-en une nouvelle.',
      to_char(v_booking.check_out_date, 'DD/MM/YYYY'),
      to_char(COALESCE(v_booking.check_out_time, '11:00'::time), 'HH24:MI');
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
-- 4. PROLONGEMENT / MODIFICATION DE RÉSERVATION (point 1)
--    Recalcule nights_count / total_amount, vérifie l'anti double-booking en
--    excluant la réservation elle-même, encaisse le supplément le cas échéant
--    et retourne le solde à payer.
-- ----------------------------------------------------------------------------
-- Cœur commun de la modification : validation tenant, mise à jour,
-- encaissement du supplément et journal d'audit. Appelé par le dashboard
-- (via update_booking) et par l'API externe (via update_booking_api).
CREATE OR REPLACE FUNCTION _update_booking_core(
  p_booking_id UUID,
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_actor_label TEXT,
  p_check_in_date DATE DEFAULT NULL,
  p_check_out_date DATE DEFAULT NULL,
  p_negotiated_price INTEGER DEFAULT NULL,
  p_special_requests TEXT DEFAULT NULL,
  p_number_of_guests INTEGER DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_mobile_money_operator TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_booking bookings;
  v_old_booking bookings;
  v_new_check_in DATE;
  v_new_check_out DATE;
  v_new_price INTEGER;
  v_nights INTEGER;
  v_new_total INTEGER;
  v_additional_amount INTEGER;
  v_balance_due INTEGER;
  v_payment_recorded BOOLEAN := FALSE;
  v_payment_method_enum payment_method;
  v_extended BOOLEAN;
BEGIN
  -- Verrouiller la réservation
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Réservation introuvable';
  END IF;

  -- Le tenant de l'acteur doit correspondre à celui de la réservation
  IF v_booking.tenant_id != p_tenant_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Vous n''êtes pas autorisé à modifier cette réservation';
  END IF;

  -- Seules les réservations confirmées ou en cours sont modifiables
  IF v_booking.status NOT IN ('confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'BOOKING_NOT_MODIFIABLE: Seules les réservations confirmées ou en cours de séjour peuvent être modifiées';
  END IF;

  v_old_booking := v_booking;
  v_new_check_in := COALESCE(p_check_in_date, v_booking.check_in_date);
  v_new_check_out := COALESCE(p_check_out_date, v_booking.check_out_date);
  v_new_price := COALESCE(p_negotiated_price, v_booking.negotiated_price);

  -- Validations de cohérence
  IF v_new_check_out <= v_new_check_in THEN
    RAISE EXCEPTION 'INVALID_DATES: La date de départ doit être après la date d''arrivée';
  END IF;

  IF v_new_price <= 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: Le prix négocié doit être supérieur à 0';
  END IF;

  -- Un client déjà arrivé ne peut pas voir sa date d'arrivée repoussée dans le futur
  IF v_booking.status = 'checked_in' AND v_new_check_in > DATE(NOW()) THEN
    RAISE EXCEPTION 'CHECKED_IN_DATE_CONFLICT: Le client est déjà arrivé — la date d''arrivée ne peut pas être déplacée dans le futur';
  END IF;

  -- Anti double-booking : on exclut la réservation en cours de modification
  IF NOT check_double_booking(v_booking.room_id, v_new_check_in, v_new_check_out, p_booking_id) THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: Une autre réservation occupe déjà cette chambre sur la période demandée';
  END IF;

  v_nights := v_new_check_out - v_new_check_in;
  v_new_total := v_new_price * v_nights;
  v_additional_amount := GREATEST(0, v_new_total - v_old_booking.total_amount);
  v_extended := v_new_check_out > v_old_booking.check_out_date;

  -- Appliquer les modifications
  UPDATE bookings
  SET check_in_date = v_new_check_in,
      check_out_date = v_new_check_out,
      negotiated_price = v_new_price,
      nights_count = v_nights,
      total_amount = v_new_total,
      special_requests = COALESCE(p_special_requests, special_requests),
      number_of_guests = COALESCE(p_number_of_guests, number_of_guests),
      -- Si le séjour a été prolongé au-delà de maintenant, le départ n'est plus dépassé
      is_overdue = CASE WHEN v_extended AND (v_new_check_out + COALESCE(v_booking.check_out_time, '11:00'::time)) > NOW() THEN FALSE ELSE is_overdue END,
      overdue_since = CASE WHEN v_extended AND (v_new_check_out + COALESCE(v_booking.check_out_time, '11:00'::time)) > NOW() THEN NULL ELSE overdue_since END
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- Encaisser le supplément si un moyen de paiement est fourni
  IF p_payment_method IS NOT NULL AND v_additional_amount > 0 THEN
    BEGIN
      v_payment_method_enum := p_payment_method::payment_method;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: Moyen de paiement inconnu';
    END;

    INSERT INTO payments (
      tenant_id, booking_id, amount, payment_method, mobile_money_operator,
      payment_date, received_by, notes
    ) VALUES (
      v_booking.tenant_id, v_booking.id, v_additional_amount, v_payment_method_enum,
      CASE WHEN p_payment_method = 'mobile_money' THEN p_mobile_money_operator ELSE NULL END,
      NOW(), p_actor_user_id,
      'Supplément (' || v_additional_amount || ' FCFA) — prolongement/modification de réservation'
    );
    v_payment_recorded := TRUE;

    -- Le trigger payments met à jour amount_paid / payment_status : re-lire
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  END IF;

  v_balance_due := v_booking.total_amount - v_booking.amount_paid;

  -- Journal d'audit
  INSERT INTO audit_logs (
    tenant_id, user_id, action, entity_type, entity_id,
    old_values, new_values, created_at
  ) VALUES (
    v_booking.tenant_id, p_actor_user_id, 'booking_updated', 'booking', v_booking.id,
    jsonb_build_object(
      'check_in_date', v_old_booking.check_in_date,
      'check_out_date', v_old_booking.check_out_date,
      'negotiated_price', v_old_booking.negotiated_price,
      'nights_count', v_old_booking.nights_count,
      'total_amount', v_old_booking.total_amount
    ),
    jsonb_build_object(
      'check_in_date', v_booking.check_in_date,
      'check_out_date', v_booking.check_out_date,
      'negotiated_price', v_booking.negotiated_price,
      'nights_count', v_booking.nights_count,
      'total_amount', v_booking.total_amount,
      'additional_amount', v_additional_amount,
      'balance_due', v_balance_due,
      'payment_recorded', v_payment_recorded,
      'modified_by', COALESCE(p_actor_label, 'user')
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'booking', to_jsonb(v_booking),
    'nights_count', v_nights,
    'total_amount', v_new_total,
    'additional_amount', v_additional_amount,
    'balance_due', v_balance_due,
    'payment_recorded', v_payment_recorded
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Wrapper dashboard : résout le tenant depuis l'utilisateur connecté
CREATE OR REPLACE FUNCTION update_booking(
  p_booking_id UUID,
  p_user_id UUID,
  p_check_in_date DATE DEFAULT NULL,
  p_check_out_date DATE DEFAULT NULL,
  p_negotiated_price INTEGER DEFAULT NULL,
  p_special_requests TEXT DEFAULT NULL,
  p_number_of_guests INTEGER DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_mobile_money_operator TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = p_user_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Utilisateur inconnu';
  END IF;

  RETURN _update_booking_core(
    p_booking_id, v_tenant_id, p_user_id, NULL,
    p_check_in_date, p_check_out_date, p_negotiated_price,
    p_special_requests, p_number_of_guests, p_payment_method, p_mobile_money_operator
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Wrapper API externe : tenant validé par la clé API (service_role uniquement)
CREATE OR REPLACE FUNCTION update_booking_api(
  p_booking_id UUID,
  p_tenant_id UUID,
  p_check_in_date DATE DEFAULT NULL,
  p_check_out_date DATE DEFAULT NULL,
  p_negotiated_price INTEGER DEFAULT NULL,
  p_special_requests TEXT DEFAULT NULL,
  p_number_of_guests INTEGER DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_mobile_money_operator TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
  RETURN _update_booking_core(
    p_booking_id, p_tenant_id, NULL, 'api',
    p_check_in_date, p_check_out_date, p_negotiated_price,
    p_special_requests, p_number_of_guests, p_payment_method, p_mobile_money_operator
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Le cœur et le wrapper API ne sont exécutables que par le rôle service_role :
-- l'API externe est l'unique point d'entrée authentifié par clé API.
REVOKE EXECUTE ON FUNCTION _update_booking_core(UUID, UUID, UUID, TEXT, DATE, DATE, INTEGER, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_booking_api(UUID, UUID, DATE, DATE, INTEGER, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _update_booking_core(UUID, UUID, UUID, TEXT, DATE, DATE, INTEGER, TEXT, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_booking_api(UUID, UUID, DATE, DATE, INTEGER, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. DÉTECTION DES DÉPARTS DÉPASSÉS (point 2)
--    À appeler périodiquement (cron / edge function / rafraîchissement du
--    dashboard). Marque is_overdue, met la chambre en alerte et notifie.
--    Retourne le nombre de réservations nouvellement signalées.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_overdue_checkouts()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_booking RECORD;
BEGIN
  FOR v_booking IN
    SELECT
      b.*,
      c.full_name AS client_name,
      r.room_number,
      a.name AS acc_name
    FROM bookings b
    LEFT JOIN clients c ON c.id = b.client_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN accommodations a ON a.id = b.accommodation_id
    WHERE b.status = 'checked_in'
      AND b.is_overdue = FALSE
      AND (b.check_out_date + COALESCE(b.check_out_time, '11:00'::time)) < NOW()
  LOOP
    UPDATE bookings
    SET is_overdue = TRUE,
        overdue_since = NOW()
    WHERE id = v_booking.id;

    -- Chambre en alerte (le client est encore dedans)
    UPDATE rooms
    SET status = 'alert'
    WHERE id = v_booking.room_id AND status = 'occupied';

    PERFORM create_system_notification(
      v_booking.tenant_id,
      NULL,
      'Départ en retard',
      'Chambre ' || COALESCE(v_booking.room_number, '') ||
        ' · ' || COALESCE(v_booking.client_name, 'Un client') ||
        ' — départ prévu le ' || to_char(v_booking.check_out_date, 'DD/MM/YYYY') ||
        ' à ' || to_char(COALESCE(v_booking.check_out_time, '11:00'::time), 'HH24:MI') ||
        ' · réservation ' || COALESCE(v_booking.booking_code, ''),
      'warning',
      '/dashboard/bookings'
    );

    INSERT INTO audit_logs (
      tenant_id, action, entity_type, entity_id, new_values, created_at
    ) VALUES (
      v_booking.tenant_id, 'overdue_checkout_detected', 'booking', v_booking.id,
      jsonb_build_object(
        'check_out_date', v_booking.check_out_date,
        'check_out_time', v_booking.check_out_time,
        'overdue_since', NOW()
      ),
      NOW()
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 6. MÉNAGE LIÉ À LA PROCHAINE ARRIVÉE (point 4)
--    Au check-out, l'alerte (+1h30) et la libération forcée (+2h) par défaut
--    sont resserrées si une arrivée est prévue plus tôt sur la même chambre.
--    La tâche garde aussi la référence de la prochaine arrivée pour l'affichage.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_cleaning_task_on_checkout()
RETURNS TRIGGER AS $$
DECLARE
  v_checkout_time TIMESTAMPTZ;
  v_alert_time TIMESTAMPTZ;
  v_force_release_time TIMESTAMPTZ;
  v_priority INTEGER := 10;
  v_next_arrival TIMESTAMPTZ;
  v_next_arrival_date DATE;
  v_note TEXT := NULL;
BEGIN
  IF NEW.status = 'checked_out' AND (OLD.status IS NULL OR OLD.status != 'checked_out') THEN
    v_checkout_time := COALESCE(NEW.actual_check_out, NOW());
    v_alert_time := v_checkout_time + INTERVAL '1 hour 30 minutes';
    v_force_release_time := v_checkout_time + INTERVAL '2 hours';

    -- Prochaine arrivée sur la même chambre (réservation confirmée ou arrivée),
    -- à partir de la date de départ de cette réservation
    SELECT b.check_in_date + COALESCE(b.check_in_time, '14:00'::time),
           b.check_in_date
      INTO v_next_arrival, v_next_arrival_date
    FROM bookings b
    WHERE b.room_id = NEW.room_id
      AND b.id != NEW.id
      AND b.status IN ('confirmed', 'checked_in')
      AND b.check_in_date >= NEW.check_out_date
    ORDER BY b.check_in_date ASC, b.check_in_time ASC
    LIMIT 1;

    IF v_next_arrival IS NOT NULL THEN
      -- Échéance de nettoyage : au plus tard avant la prochaine arrivée
      IF v_next_arrival < v_alert_time THEN
        v_alert_time := v_next_arrival;
        v_force_release_time := LEAST(v_force_release_time, v_next_arrival);
      END IF;

      -- Arrivée le jour même du départ → priorité maximale
      IF v_next_arrival_date = NEW.check_out_date THEN
        v_priority := 15;
        v_force_release_time := LEAST(v_force_release_time, v_next_arrival);
      END IF;

      v_note := 'Prochaine arrivée le ' || to_char(v_next_arrival_date, 'DD/MM') ||
                ' à ' || to_char(v_next_arrival, 'HH24:MI') ||
                ' — chambre requise avant ' || to_char(v_alert_time, 'HH24:MI') || '.';
    END IF;

    INSERT INTO cleaning_tasks (
      tenant_id, accommodation_id, room_id, booking_id,
      status, checkout_time, alert_time, force_release_time,
      next_arrival_at, priority, notes, created_at
    ) VALUES (
      NEW.tenant_id,
      NEW.accommodation_id,
      NEW.room_id,
      NEW.id,
      'pending',
      v_checkout_time,
      v_alert_time,
      v_force_release_time,
      v_next_arrival,
      v_priority,
      v_note,
      NOW()
    );

    -- Mettre la chambre en statut 'cleaning'
    UPDATE rooms SET status = 'cleaning' WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Reset du signalement de départ dépassé au check-out
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_overdue_on_checkout()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'checked_out' THEN
    NEW.is_overdue   := FALSE;
    NEW.overdue_since := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reset_overdue_on_checkout
  BEFORE UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION reset_overdue_on_checkout();
