-- 20260904_multi_residence_consistency.sql
-- Cohérence multi-résidences d'une entreprise.
--
-- 1. accommodations.guest_info : les conditions/infos de l'espace client sont
--    désormais configurables PAR RÉSIDENCE (héritage du tenant si vide).
-- 2. clients.accommodation_id : rattache chaque client à la résidence où il
--    séjourne (permet le filtrage des réceptionnistes, colonne absente jusqu'ici
--    alors que le front l'interrogeait déjà — provoquait une liste vide).
--
-- Idempotent : re-exécutable sans erreur.

-- ----------------------------------------------------------------------------
-- 1. COLONNE: accommodations.guest_info (héritage tenant si objet vide)
-- ----------------------------------------------------------------------------
ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS guest_info JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- 2. COLONNE: clients.accommodation_id (résidence d'origine du client)
-- ----------------------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_accommodation ON clients(accommodation_id);

-- Backfill : la résidence d'un client = résidence de sa dernière réservation.
UPDATE clients c
SET accommodation_id = b.accommodation_id
FROM (
  SELECT DISTINCT ON (client_id) client_id, accommodation_id
  FROM bookings
  ORDER BY client_id, created_at DESC
) b
WHERE b.client_id = c.id
  AND c.accommodation_id IS NULL;

-- Trigger : à la création d'une réservation, on rattache le client à la
-- résidence si aucune n'est encore renseignée.
CREATE OR REPLACE FUNCTION sync_client_accommodation_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE clients
  SET accommodation_id = NEW.accommodation_id
  WHERE id = NEW.client_id
    AND accommodation_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_accommodation_on_booking ON bookings;
CREATE TRIGGER trg_sync_client_accommodation_on_booking
AFTER INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION sync_client_accommodation_on_booking();

-- ----------------------------------------------------------------------------
-- 3. FONCTION: get_client_stay(p_token)
--    Le guest_info affiché est celui de la RÉSIDENCE du séjour, avec repli sur
--    celui de l'entreprise (tenant) si la résidence n'en a pas configuré.
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
  v_guest_info   JSONB;
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

  -- Guest info : résidence prioritaire, sinon héritée de l'entreprise.
  IF v_accommodation.guest_info IS NOT NULL
     AND jsonb_typeof(v_accommodation.guest_info) = 'object'
     AND (
       COALESCE(jsonb_array_length(v_accommodation.guest_info->'practical_info'), 0) > 0
       OR COALESCE(jsonb_array_length(v_accommodation.guest_info->'house_rules'), 0) > 0
       OR v_accommodation.guest_info->>'checkin_note' IS NOT NULL
       OR v_accommodation.guest_info->>'emergency_phone' IS NOT NULL
     ) THEN
    v_guest_info := v_accommodation.guest_info;
  ELSE
    v_guest_info := COALESCE(v_tenant.guest_info, '{}'::jsonb);
  END IF;

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
      'contact_phone', v_tenant.contact_phone,
      'guest_info', v_guest_info
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
