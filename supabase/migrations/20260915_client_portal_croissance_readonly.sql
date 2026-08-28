-- ============================================================================
-- Migration : Portail client en lecture seule pour le plan CROISSANCE
-- Date      : 2026-09-15
-- ============================================================================
-- Contexte : grille à 3 paliers. Le portail client existe désormais à 2
-- niveaux :
--   - Croissance : consultation seule (infos séjour, infos pratiques,
--     règlement, contact, statut de paiement) — PAS de demandes de service
--     ni de demande de prolongation.
--   - Entreprise : portail complet (consultation + demandes de service +
--     demande de prolongation), inchangé.
-- Essentiel et free restent sans portail du tout (comportement inchangé).
--
-- Cette migration met à jour get_client_stay() pour accepter 'croissance' en
-- plus de 'entreprise', et renvoie un champ tenant.portal_mode ('readonly' |
-- 'full') pour que le frontend masque les actions d'écriture en Croissance.
-- create_service_request() et request_stay_extension() restent inchangées :
-- elles continuent de bloquer tout ce qui n'est pas 'entreprise'/'enterprise'
-- (ce sont des actions d'écriture, réservées à Entreprise).
-- ============================================================================

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
  v_portal_mode  TEXT;
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

  -- Portail disponible dès Croissance (lecture seule) ; complet en Entreprise.
  SELECT plan INTO v_plan FROM subscriptions WHERE tenant_id = v_booking.tenant_id;
  IF v_plan IN ('entreprise', 'enterprise') THEN
    v_portal_mode := 'full';
  ELSIF v_plan = 'croissance' THEN
    v_portal_mode := 'readonly';
  ELSE
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
      'contact_phone', v_tenant.contact_phone,
      'guest_info', COALESCE(v_tenant.guest_info, '{}'::jsonb),
      'portal_mode', v_portal_mode
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

COMMENT ON FUNCTION get_client_stay(TEXT)
  IS 'Retourne l''état + données du séjour pour le portail client. Disponible dès Croissance (portal_mode=readonly) ; complet en Entreprise (portal_mode=full). create_service_request() et request_stay_extension() restent réservées à Entreprise.';
