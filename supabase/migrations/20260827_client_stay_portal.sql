-- 20260827_client_stay_portal.sql
-- Espace client Séjoura (formule Entreprise uniquement) :
-- chaque réservation dispose d'une page web privée, fonctionnelle pendant la
-- durée du séjour et désactivée automatiquement à sa fin.
--
-- Principes clés :
--   1. Un token cryptographique par réservation (table client_sessions, déjà
--      existante mais inutilisée).
--   2. Durée de vie dérivée de la réservation, PAS d'une date figée :
--        - avant l'arrivée   : la page expire à la fin prévue du séjour ;
--        - une fois arrivé   : la page reste active jusqu'au check-out
--          (prolongation, dépassement de séjour et auto check-out gérés par
--          les fonctions existantes check_overstays() / extend_booking()) ;
--        - terminé/annulé    : la page est immédiatement inopérante.
--      Un trigger maintient expires_at synchronisé avec la réservation.
--   3. Demandes de services client (ménage, literie, assistance) notifiées au
--      personnel via le système de notifications existant.
--   4. Vérification de la formule Entreprise côté base (ceinture + bretelles).

-- ----------------------------------------------------------------------------
-- 1. TABLE: client_service_requests (Demandes de services depuis l'espace client)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS client_service_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('cleaning', 'linen', 'assistance')),
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_service_requests_tenant
  ON client_service_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_service_requests_booking
  ON client_service_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_client_service_requests_pending
  ON client_service_requests(status) WHERE (status = 'pending');

-- ----------------------------------------------------------------------------
-- 2. RLS : defense-in-depth (l'accès public passe par les API avec service role)
-- ----------------------------------------------------------------------------
ALTER TABLE client_service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_service_requests_tenant_read" ON client_service_requests;
CREATE POLICY "client_service_requests_tenant_read"
  ON client_service_requests FOR SELECT
  USING (tenant_id = get_current_user_tenant_id());

ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_sessions_tenant_all" ON client_sessions;
CREATE POLICY "client_sessions_tenant_all"
  ON client_sessions FOR ALL
  USING (tenant_id = get_current_user_tenant_id())
  WITH CHECK (tenant_id = get_current_user_tenant_id());

-- ----------------------------------------------------------------------------
-- 3. FONCTION: get_client_stay(p_token)
--    Valide un token d'accès et retourne l'état + données du séjour (JSONB).
--    Détermine l'état fonctionnel de la page selon la logique « intelligente » :
--      - cancelled / no_show → 'cancelled' (page morte)
--      - checked_out         → 'ended'     (page morte, séjour terminé)
--      - checked_in          → 'active'    (client sur place : page vivante tant
--                                           que le check-out n'est pas effectué,
--                                           y compris pendant une prolongation)
--      - confirmed passé date → 'expired'  (séjour jamais commencé, fin planifiée)
--      - sinon               → 'active'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_client_stay(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session      client_sessions;
  v_booking      bookings;
  v_tenant       tenants;
  v_accommodation accommodations;
  v_room         rooms;
  v_room_type    room_types;
  v_client       clients;
  v_plan         TEXT;
  v_expires_at   TIMESTAMPTZ;
  v_state        TEXT;
BEGIN
  SELECT * INTO v_session
  FROM client_sessions
  WHERE access_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', FALSE, 'state', 'invalid',
      'reason', 'Ce lien est invalide ou a expiré.');
  END IF;

  IF v_session.is_active = FALSE THEN
    RETURN jsonb_build_object('valid', FALSE, 'state', 'invalid',
      'reason', 'Cet accès a été désactivé.');
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = v_session.booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', FALSE, 'state', 'invalid',
      'reason', 'Réservation introuvable.');
  END IF;

  -- Formule Entreprise uniquement (vérification serveur redondante)
  SELECT plan INTO v_plan FROM subscriptions WHERE tenant_id = v_booking.tenant_id;
  IF v_plan NOT IN ('entreprise', 'enterprise') THEN
    RETURN jsonb_build_object('valid', FALSE, 'state', 'unavailable',
      'reason', 'L''espace client n''est pas disponible pour cet établissement.');
  END IF;

  SELECT * INTO v_tenant        FROM tenants        WHERE id = v_booking.tenant_id;
  SELECT * INTO v_accommodation FROM accommodations WHERE id = v_booking.accommodation_id;
  SELECT * INTO v_room          FROM rooms          WHERE id = v_booking.room_id;
  SELECT * INTO v_room_type     FROM room_types     WHERE id = v_room.room_type_id;
  SELECT * INTO v_client        FROM clients        WHERE id = v_booking.client_id;
  SELECT expires_at INTO v_expires_at FROM client_sessions WHERE id = v_session.id;

  IF v_booking.status IN ('cancelled', 'no_show') THEN
    v_state := 'cancelled';
  ELSIF v_booking.status = 'checked_out' THEN
    v_state := 'ended';
  ELSIF v_booking.status = 'checked_in' THEN
    v_state := 'active';
  ELSIF v_booking.status = 'confirmed' AND NOW() > v_expires_at THEN
    v_state := 'expired';
  ELSE
    v_state := 'active';
  END IF;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'state', v_state,
    'session', jsonb_build_object(
      'id', v_session.id,
      'expires_at', v_expires_at,
      'is_overstay', v_booking.is_overstay
    ),
    'tenant', jsonb_build_object(
      'company_name', v_tenant.company_name,
      'logo_url', v_tenant.logo_url,
      'primary_color', v_tenant.primary_color,
      'contact_phone', v_tenant.contact_phone
    ),
    'accommodation', jsonb_build_object(
      'name', v_accommodation.name,
      'address', v_accommodation.address,
      'city', v_accommodation.city,
      'contact_phone', v_accommodation.contact_phone
    ),
    'room', jsonb_build_object(
      'room_number', v_room.room_number,
      'floor', v_room.floor,
      'room_type_name', v_room_type.name,
      'capacity', v_room_type.capacity,
      'amenities', COALESCE(v_room_type.amenities, '[]'::jsonb)
    ),
    'booking', jsonb_build_object(
      'id', v_booking.id,
      'booking_code', v_booking.booking_code,
      'check_in_date', v_booking.check_in_date,
      'check_out_date', v_booking.check_out_date,
      'check_in_time', v_booking.check_in_time,
      'check_out_time', v_booking.check_out_time,
      'nights_count', v_booking.nights_count,
      'status', v_booking.status,
      'payment_status', v_booking.payment_status,
      'total_amount', v_booking.total_amount,
      'amount_paid', v_booking.amount_paid,
      'special_requests', v_booking.special_requests
    ),
    'client', jsonb_build_object(
      'full_name', v_client.full_name
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. FONCTION: create_service_request(p_token, p_request_type, p_message)
--    Crée une demande de service depuis l'espace client et notifie le personnel.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_service_request(
  p_token        TEXT,
  p_request_type TEXT,
  p_message      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session    client_sessions;
  v_booking    bookings;
  v_plan       TEXT;
  v_request    client_service_requests;
  v_client_name TEXT;
  v_room_number TEXT;
BEGIN
  SELECT * INTO v_session
  FROM client_sessions
  WHERE access_token = p_token AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Ce lien est invalide ou a expiré.');
  END IF;

  SELECT * INTO v_booking
  FROM bookings
  WHERE id = v_session.booking_id AND status IN ('confirmed', 'checked_in');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Votre séjour est terminé.');
  END IF;

  SELECT plan INTO v_plan FROM subscriptions WHERE tenant_id = v_booking.tenant_id;
  IF v_plan NOT IN ('entreprise', 'enterprise') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Ce service est indisponible.');
  END IF;

  IF p_request_type NOT IN ('cleaning', 'linen', 'assistance') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Type de demande invalide.');
  END IF;

  INSERT INTO client_service_requests (tenant_id, booking_id, client_id, request_type, message, status)
  VALUES (v_booking.tenant_id, v_booking.id, v_session.client_id, p_request_type, NULLIF(p_message, ''), 'pending')
  RETURNING * INTO v_request;

  SELECT full_name INTO v_client_name FROM clients WHERE id = v_session.client_id;
  SELECT room_number INTO v_room_number FROM rooms WHERE id = v_booking.room_id;

  PERFORM create_system_notification(
    v_booking.tenant_id,
    NULL,
    'Nouvelle demande client',
    COALESCE(v_client_name, 'Client') || ' · Chambre ' || COALESCE(v_room_number, '') ||
      ' · ' || v_request.request_type ||
      CASE WHEN v_request.message IS NOT NULL THEN ' · « ' || v_request.message || ' »' ELSE '' END,
    'info',
    '/dashboard/bookings'
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id', v_request.id,
    'request_type', v_request.request_type,
    'status', v_request.status
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. TRIGGER: sync_client_session_expiry()
--    Garde les sessions client synchronisées avec la réservation :
--      - prolongation (extend_booking)  → expires_at prolongé automatiquement ;
--      - check-in / check-out / annulation → activation / désactivation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_client_session_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
BEGIN
  v_expires := (NEW.check_out_date + NEW.check_out_time) AT TIME ZONE current_setting('TIMEZONE');

  IF NEW.status IN ('checked_out', 'cancelled', 'no_show') THEN
    UPDATE client_sessions
    SET is_active = FALSE,
        expires_at = LEAST(expires_at, NOW())
    WHERE booking_id = NEW.id AND is_active = TRUE;
  ELSIF NEW.status IN ('confirmed', 'checked_in') THEN
    UPDATE client_sessions
    SET is_active = TRUE,
        expires_at = v_expires
    WHERE booking_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_session_expiry ON bookings;
CREATE TRIGGER trg_sync_client_session_expiry
AFTER UPDATE OF status, check_out_date, check_out_time ON bookings
FOR EACH ROW
EXECUTE FUNCTION sync_client_session_expiry();
