-- 20260903_stay_timeline.sql
-- Historique intelligent des séjours (« timeline ») :
--   * stay_activities : chaque mouvement du client pendant son séjour est
--     horodaté automatiquement (création de réservation, check-in, check-out,
--     prolongation, dépassement, demandes de service, demandes de prolongation,
--     paiements) via des triggers — aucun appel API à modifier.
--   * stay_notes : suivi comportemental saisi par la réceptionniste
--     (incident, dégât, objet oublié, avis, autre) — interne au personnel.
--
-- Idempotent : ré-exécutable sans erreur (backfill joué une seule fois).

-- ----------------------------------------------------------------------------
-- 1. TABLE: stay_activities (timeline du séjour)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stay_activities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,
  activity_type  TEXT NOT NULL CHECK (activity_type IN (
    'booking_created', 'check_in', 'check_out', 'booking_extended',
    'overstay_detected', 'overstay_auto_checkout', 'service_request',
    'service_request_done', 'stay_extension_requested',
    'stay_extension_approved', 'stay_extension_rejected', 'payment'
  )),
  title          TEXT NOT NULL,
  description    TEXT,
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stay_activities_tenant
  ON stay_activities(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stay_activities_booking
  ON stay_activities(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stay_activities_client
  ON stay_activities(client_id, created_at DESC);

ALTER TABLE stay_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stay_activities_tenant_read" ON stay_activities;
CREATE POLICY "stay_activities_tenant_read"
  ON stay_activities FOR SELECT
  USING (tenant_id = get_current_user_tenant_id());

-- ----------------------------------------------------------------------------
-- 2. TABLE: stay_notes (suivi comportemental — interne au personnel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stay_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  note_type   TEXT NOT NULL DEFAULT 'other'
                CHECK (note_type IN ('incident', 'damage', 'forgotten_object', 'feedback', 'other')),
  description TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'low'
                CHECK (severity IN ('low', 'medium', 'high')),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stay_notes_tenant
  ON stay_notes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stay_notes_booking
  ON stay_notes(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stay_notes_client
  ON stay_notes(client_id, created_at DESC);

ALTER TABLE stay_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stay_notes_tenant_read" ON stay_notes;
CREATE POLICY "stay_notes_tenant_read"
  ON stay_notes FOR SELECT
  USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "stay_notes_tenant_insert" ON stay_notes;
CREATE POLICY "stay_notes_tenant_insert"
  ON stay_notes FOR INSERT
  WITH CHECK (tenant_id = get_current_user_tenant_id());

-- ----------------------------------------------------------------------------
-- 3. HELPER: add_stay_activity() — écrit une ligne de timeline (SECURITY
--    DEFINER : appelable par les triggers quel que soit le RLS courant).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_stay_activity(
  p_tenant_id      UUID,
  p_booking_id     UUID,
  p_activity_type  TEXT,
  p_title          TEXT,
  p_description    TEXT DEFAULT NULL,
  p_meta           JSONB DEFAULT '{}'::jsonb,
  p_created_by     UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  SELECT client_id INTO v_client_id FROM bookings WHERE id = p_booking_id;
  INSERT INTO stay_activities (
    tenant_id, booking_id, client_id, activity_type, title, description, meta, created_by
  )
  VALUES (
    p_tenant_id, p_booking_id, v_client_id, p_activity_type, p_title,
    p_description, COALESCE(p_meta, '{}'::jsonb), p_created_by
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. TRIGGER bookings : création, check-in, check-out
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_stay_activity_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_number TEXT;
BEGIN
  SELECT room_number INTO v_room_number FROM rooms WHERE id = NEW.room_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.id, 'booking_created',
      'Réservation créée',
      'Chambre ' || COALESCE(v_room_number, '') || ' · ' ||
        to_char(NEW.check_in_date, 'DD/MM/YYYY') || ' → ' ||
        to_char(NEW.check_out_date, 'DD/MM/YYYY') || ' · ' || NEW.nights_count || ' nuit(s)',
      jsonb_build_object('booking_code', NEW.booking_code),
      NEW.created_by
    );
  ELSIF NEW.status = 'checked_in' AND OLD.status <> 'checked_in' THEN
    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.id, 'check_in',
      'Arrivée (check-in)',
      'Arrivée du client en chambre ' || COALESCE(v_room_number, ''),
      jsonb_build_object('actual_check_in', NEW.actual_check_in)
    );
  ELSIF NEW.status = 'checked_out' AND OLD.status <> 'checked_out' THEN
    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.id, 'check_out',
      'Départ (check-out)',
      'Départ du client · chambre ' || COALESCE(v_room_number, ''),
      jsonb_build_object('actual_check_out', NEW.actual_check_out)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stay_activity_bookings ON bookings;
CREATE TRIGGER trg_stay_activity_bookings
AFTER INSERT OR UPDATE OF status ON bookings
FOR EACH ROW
EXECUTE FUNCTION trg_stay_activity_bookings();

-- ----------------------------------------------------------------------------
-- 5. TRIGGER payments : encaissement
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_stay_activity_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_symbol TEXT;
  v_method TEXT;
BEGIN
  SELECT default_currency_symbol INTO v_symbol FROM tenants WHERE id = NEW.tenant_id;
  v_method := REPLACE(REPLACE(COALESCE(NEW.payment_method::text, ''), '_', ' '), 'pi spi', 'PI-SPI');

  PERFORM add_stay_activity(
    NEW.tenant_id, NEW.booking_id, 'payment',
    'Paiement reçu',
    'Montant ' || COALESCE(v_symbol, '') || ' ' || NEW.amount ||
      CASE WHEN v_method <> '' THEN ' · ' || v_method ELSE '' END ||
      CASE WHEN NEW.notes IS NOT NULL THEN ' · « ' || NEW.notes || ' »' ELSE '' END,
    jsonb_build_object(
      'amount', NEW.amount,
      'payment_method', NEW.payment_method,
      'reference', NEW.reference
    ),
    NEW.received_by
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stay_activity_payment ON payments;
CREATE TRIGGER trg_stay_activity_payment
AFTER INSERT ON payments
FOR EACH ROW
EXECUTE FUNCTION trg_stay_activity_payment();

-- ----------------------------------------------------------------------------
-- 6. TRIGGER client_service_requests : demande + traitement
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_stay_activity_service_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label TEXT;
BEGIN
  v_label := CASE NEW.request_type
    WHEN 'cleaning' THEN 'Ménage'
    WHEN 'linen' THEN 'Literie'
    ELSE 'Assistance'
  END;

  IF TG_OP = 'INSERT' THEN
    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.booking_id, 'service_request',
      'Demande de service',
      v_label || CASE WHEN NEW.message IS NOT NULL THEN ' · « ' || NEW.message || ' »' ELSE '' END,
      jsonb_build_object('request_type', NEW.request_type)
    );
  ELSIF NEW.status = 'done' AND OLD.status <> 'done' THEN
    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.booking_id, 'service_request_done',
      'Demande de service traitée',
      v_label || ' · terminée',
      jsonb_build_object('request_type', NEW.request_type)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stay_activity_service_request ON client_service_requests;
CREATE TRIGGER trg_stay_activity_service_request
AFTER INSERT OR UPDATE OF status ON client_service_requests
FOR EACH ROW
EXECUTE FUNCTION trg_stay_activity_service_request();

-- ----------------------------------------------------------------------------
-- 7. TRIGGER client_stay_extension_requests : demande + décision
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_stay_activity_extension_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.booking_id, 'stay_extension_requested',
      'Demande de prolongation',
      'Départ souhaité au ' || to_char(NEW.requested_check_out_date, 'DD/MM/YYYY') ||
        CASE WHEN NEW.message IS NOT NULL THEN ' · « ' || NEW.message || ' »' ELSE '' END,
      jsonb_build_object('requested_check_out_date', NEW.requested_check_out_date)
    );
  ELSIF NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
    SELECT id INTO v_user_id FROM users WHERE auth_user_id = NEW.processed_by;

    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.booking_id,
      CASE WHEN NEW.status = 'approved' THEN 'stay_extension_approved' ELSE 'stay_extension_rejected' END,
      CASE WHEN NEW.status = 'approved' THEN 'Prolongation acceptée' ELSE 'Prolongation refusée' END,
      'Demande de départ au ' || to_char(NEW.requested_check_out_date, 'DD/MM/YYYY') ||
        CASE WHEN NEW.processed_note IS NOT NULL THEN ' · « ' || NEW.processed_note || ' »' ELSE '' END,
      jsonb_build_object(
        'requested_check_out_date', NEW.requested_check_out_date,
        'processed_note', NEW.processed_note
      ),
      v_user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stay_activity_extension_request ON client_stay_extension_requests;
CREATE TRIGGER trg_stay_activity_extension_request
AFTER INSERT OR UPDATE OF status ON client_stay_extension_requests
FOR EACH ROW
EXECUTE FUNCTION trg_stay_activity_extension_request();

-- ----------------------------------------------------------------------------
-- 8. TRIGGER booking_extensions : prolongation appliquée / dépassement facturé
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_stay_activity_booking_extension()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_number TEXT;
BEGIN
  SELECT r.room_number INTO v_room_number
  FROM rooms r
  JOIN bookings b ON b.room_id = r.id
  WHERE b.id = NEW.booking_id;

  IF NEW.source = 'overstay' THEN
    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.booking_id, 'overstay_auto_checkout',
      'Dépassement de séjour facturé',
      'Chambre ' || COALESCE(v_room_number, '') || ' · ' || NEW.extra_nights ||
        ' nuitée(s) ajoutée(s) au montant dû',
      jsonb_build_object(
        'extra_nights', NEW.extra_nights,
        'previous_check_out_date', NEW.previous_check_out_date,
        'new_check_out_date', NEW.new_check_out_date
      )
    );
  ELSE
    PERFORM add_stay_activity(
      NEW.tenant_id, NEW.booking_id, 'booking_extended',
      'Séjour prolongé',
      'Chambre ' || COALESCE(v_room_number, '') || ' · départ reporté du ' ||
        to_char(NEW.previous_check_out_date, 'DD/MM/YYYY') || ' au ' ||
        to_char(NEW.new_check_out_date, 'DD/MM/YYYY') || ' · ' || NEW.extra_nights || ' nuit(s)',
      jsonb_build_object(
        'extra_nights', NEW.extra_nights,
        'previous_check_out_date', NEW.previous_check_out_date,
        'new_check_out_date', NEW.new_check_out_date
      ),
      NEW.created_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stay_activity_booking_extension ON booking_extensions;
CREATE TRIGGER trg_stay_activity_booking_extension
AFTER INSERT ON booking_extensions
FOR EACH ROW
EXECUTE FUNCTION trg_stay_activity_booking_extension();

-- ----------------------------------------------------------------------------
-- 9. REALTIME : timeline et notes en direct
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'stay_activities'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.stay_activities;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'stay_notes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.stay_notes;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 10. BACKFILL : reconstitue la timeline depuis l'existant (joué une seule
--     fois, tant que stay_activities est vide).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stay_activities) THEN
    RETURN;
  END IF;

  -- Création de réservation (toutes réservations)
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_by, created_at)
  SELECT b.tenant_id, b.id, b.client_id, 'booking_created', 'Réservation créée',
    'Chambre ' || COALESCE(r.room_number, '') || ' · ' ||
      to_char(b.check_in_date, 'DD/MM/YYYY') || ' → ' ||
      to_char(b.check_out_date, 'DD/MM/YYYY') || ' · ' || b.nights_count || ' nuit(s)',
    jsonb_build_object('booking_code', b.booking_code),
    b.created_by, b.created_at
  FROM bookings b
  LEFT JOIN rooms r ON r.id = b.room_id;

  -- Arrivées (statuts checked_in / checked_out)
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_at)
  SELECT b.tenant_id, b.id, b.client_id, 'check_in', 'Arrivée (check-in)',
    'Arrivée du client en chambre ' || COALESCE(r.room_number, ''),
    jsonb_build_object('actual_check_in', b.actual_check_in),
    COALESCE(b.actual_check_in,
      (b.check_in_date + COALESCE(b.check_in_time, '14:00'::time)) AT TIME ZONE current_setting('TIMEZONE'))
  FROM bookings b
  LEFT JOIN rooms r ON r.id = b.room_id
  WHERE b.status IN ('checked_in', 'checked_out');

  -- Départs (statut checked_out)
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_at)
  SELECT b.tenant_id, b.id, b.client_id, 'check_out', 'Départ (check-out)',
    'Départ du client · chambre ' || COALESCE(r.room_number, ''),
    jsonb_build_object('actual_check_out', b.actual_check_out),
    COALESCE(b.actual_check_out,
      (b.check_out_date + COALESCE(b.check_out_time, '11:00'::time)) AT TIME ZONE current_setting('TIMEZONE'))
  FROM bookings b
  LEFT JOIN rooms r ON r.id = b.room_id
  WHERE b.status = 'checked_out';

  -- Prolongations appliquées et dépassements
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_by, created_at)
  SELECT be.tenant_id, be.booking_id, b.client_id,
    CASE WHEN be.source = 'overstay' THEN 'overstay_auto_checkout' ELSE 'booking_extended' END,
    CASE WHEN be.source = 'overstay' THEN 'Dépassement de séjour facturé' ELSE 'Séjour prolongé' END,
    'Chambre ' || COALESCE(r.room_number, '') || ' · départ reporté du ' ||
      to_char(be.previous_check_out_date, 'DD/MM/YYYY') || ' au ' ||
      to_char(be.new_check_out_date, 'DD/MM/YYYY') || ' · ' || be.extra_nights || ' nuit(s)',
    jsonb_build_object(
      'extra_nights', be.extra_nights,
      'previous_check_out_date', be.previous_check_out_date,
      'new_check_out_date', be.new_check_out_date
    ),
    be.created_by, be.created_at
  FROM booking_extensions be
  JOIN bookings b ON b.id = be.booking_id
  LEFT JOIN rooms r ON r.id = b.room_id;

  -- Demandes de service
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_at)
  SELECT csr.tenant_id, csr.booking_id, csr.client_id, 'service_request', 'Demande de service',
    CASE csr.request_type
      WHEN 'cleaning' THEN 'Ménage'
      WHEN 'linen' THEN 'Literie'
      ELSE 'Assistance'
    END || CASE WHEN csr.message IS NOT NULL THEN ' · « ' || csr.message || ' »' ELSE '' END,
    jsonb_build_object('request_type', csr.request_type),
    csr.created_at
  FROM client_service_requests csr;

  -- Demandes de service traitées
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_at)
  SELECT csr.tenant_id, csr.booking_id, csr.client_id, 'service_request_done', 'Demande de service traitée',
    CASE csr.request_type
      WHEN 'cleaning' THEN 'Ménage'
      WHEN 'linen' THEN 'Literie'
      ELSE 'Assistance'
    END || ' · terminée',
    jsonb_build_object('request_type', csr.request_type),
    csr.created_at
  FROM client_service_requests csr
  WHERE csr.status = 'done';

  -- Demandes de prolongation
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_at)
  SELECT csr.tenant_id, csr.booking_id, csr.client_id, 'stay_extension_requested', 'Demande de prolongation',
    'Départ souhaité au ' || to_char(csr.requested_check_out_date, 'DD/MM/YYYY') ||
      CASE WHEN csr.message IS NOT NULL THEN ' · « ' || csr.message || ' »' ELSE '' END,
    jsonb_build_object('requested_check_out_date', csr.requested_check_out_date),
    csr.created_at
  FROM client_stay_extension_requests csr;

  -- Décisions sur les demandes de prolongation
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_by, created_at)
  SELECT csr.tenant_id, csr.booking_id, csr.client_id,
    CASE WHEN csr.status = 'approved' THEN 'stay_extension_approved' ELSE 'stay_extension_rejected' END,
    CASE WHEN csr.status = 'approved' THEN 'Prolongation acceptée' ELSE 'Prolongation refusée' END,
    'Demande de départ au ' || to_char(csr.requested_check_out_date, 'DD/MM/YYYY') ||
      CASE WHEN csr.processed_note IS NOT NULL THEN ' · « ' || csr.processed_note || ' »' ELSE '' END,
    jsonb_build_object('requested_check_out_date', csr.requested_check_out_date),
    u.id,
    COALESCE(csr.processed_at, csr.created_at)
  FROM client_stay_extension_requests csr
  LEFT JOIN users u ON u.auth_user_id = csr.processed_by
  WHERE csr.status IN ('approved', 'rejected');

  -- Paiements
  INSERT INTO stay_activities (tenant_id, booking_id, client_id, activity_type, title, description, meta, created_by, created_at)
  SELECT p.tenant_id, p.booking_id, b.client_id, 'payment', 'Paiement reçu',
    'Montant ' || COALESCE(t.default_currency_symbol, '') || ' ' || p.amount ||
      ' · ' || REPLACE(REPLACE(COALESCE(p.payment_method::text, ''), '_', ' '), 'pi spi', 'PI-SPI') ||
      CASE WHEN p.notes IS NOT NULL THEN ' · « ' || p.notes || ' »' ELSE '' END,
    jsonb_build_object(
      'amount', p.amount,
      'payment_method', p.payment_method,
      'reference', p.reference
    ),
    p.received_by,
    COALESCE(p.created_at, p.payment_date)
  FROM payments p
  JOIN bookings b ON b.id = p.booking_id
  LEFT JOIN tenants t ON t.id = p.tenant_id;
END $$;
