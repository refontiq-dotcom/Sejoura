-- 20260825_overstay_auto_checkout.sql
-- Détection intelligente des dépassements de séjour.
--
-- Problème : un client arrivé pour une nuitée reste en statut 'checked_in' et
-- la chambre reste 'occupied' indéfiniment après la date de départ prévue, sans
-- qu'aucune alerte ne soit émise.
--
-- Solution (3 temps) :
--   1. ALERTE  : dès que l'heure de départ prévue (check_out_date + check_out_time)
--                est dépassée, la réservation est marquée is_overstay = TRUE et une
--                notification « Dépassement de séjour » est envoyée au personnel.
--   2. PROLONGER : le personnel peut prolonger le séjour (extend_booking) : nouvelles
--                dates, recalcule du nombre de nuits et du montant total dû.
--   3. AUTO CHECK-OUT : si personne n'agit avant la fin du délai de grâce, la
--                réservation est clôturée automatiquement (chambre libérée, tâche
--                de ménage déclenchée, nuitées supplémentaires ajoutées au dû).
--
-- La fonction check_overstays() est à appeler périodiquement (pg_cron ici, ou
-- depuis le frontend au chargement des pages). Idempotent.

-- ----------------------------------------------------------------------------
-- 1. COLONNES DE SUIVI DU DÉPASSEMENT SUR bookings
-- ----------------------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_overstay BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS overstay_detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS overstay_auto_checked_out BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_bookings_overstay
  ON bookings(tenant_id)
  WHERE is_overstay = TRUE AND status = 'checked_in';

-- ----------------------------------------------------------------------------
-- 2. FONCTION: check_overstays()
--    Détecte les séjours dépassés, alerte, puis auto-check-out après délai.
--    Retourne le nombre de réservations traitées.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_overstays(
  p_alert_after_minutes INTEGER DEFAULT 0,
  p_auto_checkout_after_minutes INTEGER DEFAULT 120
)
RETURNS INTEGER AS $$
DECLARE
  v_booking RECORD;
  v_client_name TEXT;
  v_room_number TEXT;
  v_extra_nights INTEGER;
  v_processed INTEGER := 0;
BEGIN
  -- --------------------------------------------------------------------------
  -- PHASE 1 — Alerte de dépassement (signalée une seule fois)
  -- --------------------------------------------------------------------------
  FOR v_booking IN
    SELECT *
    FROM bookings
    WHERE status = 'checked_in'
      AND is_overstay = FALSE
      AND ((check_out_date + check_out_time) AT TIME ZONE current_setting('TIMEZONE'))
            + make_interval(mins => p_alert_after_minutes) <= NOW()
  LOOP
    UPDATE bookings
    SET is_overstay = TRUE,
        overstay_detected_at = NOW()
    WHERE id = v_booking.id;

    SELECT full_name INTO v_client_name FROM clients WHERE id = v_booking.client_id;
    SELECT room_number INTO v_room_number FROM rooms WHERE id = v_booking.room_id;

    PERFORM create_system_notification(
      v_booking.tenant_id,
      NULL,
      'Dépassement de séjour',
      'Chambre ' || COALESCE(v_room_number, '') ||
        ' · ' || COALESCE(v_client_name, 'Client') ||
        ' · départ prévu le ' || to_char(v_booking.check_out_date, 'DD/MM/YYYY') ||
        ' à ' || to_char(v_booking.check_out_time, 'HH24:MI') ||
        ' — Prolonger le séjour ou faire libérer la chambre.',
      'warning',
      '/dashboard/bookings'
    );

    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
    VALUES (v_booking.tenant_id, 'overstay_detected', 'booking', v_booking.id,
      jsonb_build_object(
        'check_out_date', v_booking.check_out_date,
        'check_out_time', v_booking.check_out_time
      ),
      NOW());

    v_processed := v_processed + 1;
  END LOOP;

  -- --------------------------------------------------------------------------
  -- PHASE 2 — Auto check-out après le délai de grâce
  --    Le trigger create_cleaning_task_on_checkout met la chambre en 'cleaning'
  --    et crée la tâche de ménage automatiquement.
  -- --------------------------------------------------------------------------
  FOR v_booking IN
    SELECT *
    FROM bookings
    WHERE status = 'checked_in'
      AND is_overstay = TRUE
      AND overstay_detected_at IS NOT NULL
      AND overstay_auto_checked_out = FALSE
      AND overstay_detected_at + make_interval(mins => p_auto_checkout_after_minutes) <= NOW()
  LOOP
    v_extra_nights := GREATEST((CURRENT_DATE - v_booking.check_out_date)::int, 0);

    -- Les nuitées supplémentaires sont ajoutées au montant dû (pas d'entrée en
    -- caisse automatique : le personnel encaisse à la régularisation).
    IF v_extra_nights > 0 THEN
      UPDATE bookings
      SET total_amount = v_booking.total_amount + v_extra_nights * v_booking.negotiated_price,
          nights_count = v_booking.nights_count + v_extra_nights,
          payment_status = CASE
            WHEN amount_paid >= v_booking.total_amount + v_extra_nights * v_booking.negotiated_price
              THEN 'paid'::payment_status
            WHEN amount_paid > 0 THEN 'partial'::payment_status
            ELSE 'unpaid'::payment_status
          END,
          status = 'checked_out',
          actual_check_out = NOW(),
          overstay_auto_checked_out = TRUE
      WHERE id = v_booking.id;
    ELSE
      UPDATE bookings
      SET status = 'checked_out',
          actual_check_out = NOW(),
          overstay_auto_checked_out = TRUE
      WHERE id = v_booking.id;
    END IF;

    SELECT full_name INTO v_client_name FROM clients WHERE id = v_booking.client_id;
    SELECT room_number INTO v_room_number FROM rooms WHERE id = v_booking.room_id;

    PERFORM create_system_notification(
      v_booking.tenant_id,
      NULL,
      'Départ automatique (dépassement de séjour)',
      'Chambre ' || COALESCE(v_room_number, '') ||
        ' · ' || COALESCE(v_client_name, 'Client') ||
        CASE WHEN v_extra_nights > 0
          THEN ' · ' || v_extra_nights || ' nuitée(s) ajoutée(s) au montant dû.'
          ELSE ' · chambre libérée.' END,
      'info',
      '/dashboard/bookings'
    );

    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
    VALUES (v_booking.tenant_id, 'overstay_auto_checkout', 'booking', v_booking.id,
      jsonb_build_object(
        'extra_nights', v_extra_nights,
        'extra_amount', v_extra_nights * v_booking.negotiated_price,
        'auto', TRUE
      ),
      NOW());

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. FONCTION: extend_booking()
--    Prolonge le séjour d'une réservation active (confirmée ou arrivée) :
--    nouvelle date de départ, recalcule des nuits et du montant total,
--    et réinitialise le statut de dépassement.
-- ----------------------------------------------------------------------------
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

  -- Vérifier que la chambre reste disponible sur la période prolongée
  SELECT check_double_booking(v_booking.room_id, v_booking.check_in_date, p_new_check_out_date, p_booking_id)
  INTO v_is_available;

  IF NOT v_is_available THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: La chambre est déjà réservée sur la période prolongée';
  END IF;

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
    '/dashboard/bookings'
  );

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4. PLANIFICATION AUTOMATIQUE (pg_cron si disponible)
--    Vérification toutes les 15 minutes : alerte immédiate, auto check-out
--    après 2h de délai de grâce.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('sejoura-check-overstays');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('sejoura-check-overstays', '*/15 * * * *',
      'SELECT check_overstays(0, 120)');
  END IF;
END $$;
