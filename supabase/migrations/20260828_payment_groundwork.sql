-- ============================================================================
-- SÉJOURA — PAIEMENTS EN LIGNE AUTOMATISÉS (PRÉPARATION)
-- ============================================================================

-- 1. Ajout du statut 'pending_payment'
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_payment' BEFORE 'confirmed';

-- 2. Création de la table tenant_payment_gateways (Stockage sécurisé des clés API)
CREATE TABLE tenant_payment_gateways (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL, -- 'wave', 'orange_money', 'mtn', etc.
  api_keys        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX idx_tenant_payment_gateways ON tenant_payment_gateways(tenant_id);

ALTER TABLE tenant_payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_payment_gateways_select_admin" ON tenant_payment_gateways
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "tenant_payment_gateways_insert_admin" ON tenant_payment_gateways
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "tenant_payment_gateways_update_admin" ON tenant_payment_gateways
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- 3. Création de la table online_payment_transactions
CREATE TABLE online_payment_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  provider_transaction_id TEXT,
  amount          INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'successful', 'failed', 'expired'
  checkout_url    TEXT,
  webhook_payload JSONB,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_online_payment_transactions_booking ON online_payment_transactions(booking_id);
CREATE INDEX idx_online_payment_transactions_tenant ON online_payment_transactions(tenant_id);

ALTER TABLE online_payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "online_payment_transactions_select_staff" ON online_payment_transactions
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- 4. Triggers updated_at
CREATE TRIGGER trigger_tenant_payment_gateways_updated BEFORE UPDATE ON tenant_payment_gateways
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_online_payment_transactions_updated BEFORE UPDATE ON online_payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Modification de la contrainte anti double-booking pour INCLURE pending_payment
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_double_booking;

ALTER TABLE bookings
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&,
    (CASE WHEN status IN ('pending_payment', 'confirmed', 'checked_in') THEN 1 ELSE 0 END) WITH =
  )
  WHERE (status IN ('pending_payment', 'confirmed', 'checked_in'));

CREATE OR REPLACE FUNCTION check_double_booking(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('pending_payment', 'confirmed', 'checked_in')
    AND id != COALESCE(p_exclude_booking_id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND daterange(check_in_date, check_out_date, '[)') && daterange(p_check_in, p_check_out, '[)');

  RETURN v_conflict_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Mise à jour de create_booking pour accepter le paramètre p_initial_status
DROP FUNCTION IF EXISTS create_booking(UUID, UUID, UUID, UUID, DATE, DATE, INTEGER, INTEGER, INTEGER, INTEGER, UUID, TIME, TIME, INTEGER, TEXT);

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
  p_special_requests TEXT DEFAULT NULL,
  p_initial_status booking_status DEFAULT 'confirmed'
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
    number_of_guests, special_requests, created_by, status
  ) VALUES (
    p_tenant_id, p_accommodation_id, p_room_id, p_client_id,
    v_code, p_check_in_date, p_check_out_date,
    p_check_in_time, v_check_out_time,
    p_base_price, p_negotiated_price, p_nights_count, p_total_amount,
    p_number_of_guests, p_special_requests, p_created_by, p_initial_status
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. Fonction d'annulation automatique (Cron worker fallback)
CREATE OR REPLACE FUNCTION expire_pending_bookings()
RETURNS void AS $$
BEGIN
  -- Annule toutes les réservations en attente depuis plus de 30 minutes
  UPDATE bookings
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE status = 'pending_payment'
    AND created_at < NOW() - INTERVAL '30 minutes';
    
  -- Les transactions en ligne correspondantes expirent aussi
  UPDATE online_payment_transactions
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
