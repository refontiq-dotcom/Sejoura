-- 20260902_booking_extensions.sql
-- Historique métier des prolongations de séjour, pour la « facture intelligente » :
-- chaque prolongation (extend_booking) ou dépassement de séjour (auto check-out)
-- est enregistrée et retracée sur la facture (lignes « Nuitée initiale »,
-- « Prolongation 1/2/… », « Dépassement de séjour »).
--
-- Idempotent : ré-exécutable sans erreur.

-- ----------------------------------------------------------------------------
-- 1. TABLE: booking_extensions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_extensions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id             UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  previous_check_out_date DATE NOT NULL,
  new_check_out_date     DATE NOT NULL,
  extra_nights           INTEGER NOT NULL CHECK (extra_nights > 0),
  source                 TEXT NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual', 'client_request', 'overstay')),
  created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_extensions_tenant
  ON booking_extensions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_extensions_booking
  ON booking_extensions(booking_id, created_at);

ALTER TABLE booking_extensions ENABLE ROW LEVEL SECURITY;

-- Le personnel de l'établissement lit l'historique (les écritures passent par
-- des fonctions SECURITY DEFINER / le service role).
DROP POLICY IF EXISTS "booking_extensions_select_tenant" ON booking_extensions;
CREATE POLICY "booking_extensions_select_tenant"
  ON booking_extensions FOR SELECT
  USING (tenant_id = get_current_user_tenant_id());

-- ----------------------------------------------------------------------------
-- 2. FONCTION: extend_booking() — enregistre chaque prolongation
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

  -- Vérifier que la chambre reste disponible sur la période prolongée
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

  -- Historique métier : la trace de la prolongation (pour la facture)
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
    '/dashboard/bookings'
  );

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. FONCTION: check_overstays() — trace le dépassement auto check-out
--    (lignes « Dépassement de séjour » sur la facture).
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

      -- Trace « Dépassement de séjour » pour la facture (le RECORD garde les
      -- valeurs d'avant UPDATE : check_out_date = départ initialement prévu).
      INSERT INTO booking_extensions (
        tenant_id, booking_id, previous_check_out_date, new_check_out_date,
        extra_nights, source, created_by
      )
      VALUES (
        v_booking.tenant_id, v_booking.id,
        v_booking.check_out_date, CURRENT_DATE,
        v_extra_nights, 'overstay', NULL
      );
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
