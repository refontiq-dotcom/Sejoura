-- 20260816_client_stay_extension.sql
-- Prolongation de séjour depuis l'espace client (formule Entreprise uniquement) :
-- le client demande une nouvelle date de départ, le personnel la valide
-- (prolongation réelle via extend_booking) ou la refuse depuis le tableau de bord
-- Réservations.
--
-- Flux :
--   1. Le client (portail /stay) choisit une nouvelle date de départ.
--   2. request_stay_extension() vérifie le token, la formule Entreprise, que la
--      date est postérieure au départ actuel et que la chambre est disponible
--      (check_double_booking), puis crée une demande + notifie le personnel.
--   3. Le personnel voit les demandes en attente sur /dashboard/bookings :
--      - « Prolonger »  → ouvre la modal de prolongation existante (paiement du
--        supplément inclus) pré-remplie avec la date demandée ;
--      - « Refuser »    → process_stay_extension(..., 'rejected', ...).
--   4. Après prolongation réussie, la demande est marquée 'approved' via
--      process_stay_extension(..., 'approved', ...). Le trigger
--      sync_client_session_expiry() prolonge automatiquement l'accès client.

-- ----------------------------------------------------------------------------
-- 1. TABLE: client_stay_extension_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_stay_extension_requests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id               UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id                UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  requested_check_out_date DATE NOT NULL,
  message                  TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at             TIMESTAMPTZ,
  processed_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_note           TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_stay_extension_requests_tenant
  ON client_stay_extension_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_stay_extension_requests_booking
  ON client_stay_extension_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_client_stay_extension_requests_pending
  ON client_stay_extension_requests(status) WHERE (status = 'pending');

-- ----------------------------------------------------------------------------
-- 2. RLS : accès personnel de l'établissement uniquement (les clients passent
--    par les API publiques avec service role).
-- ----------------------------------------------------------------------------
ALTER TABLE client_stay_extension_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_stay_extension_requests_tenant_all"
  ON client_stay_extension_requests;
CREATE POLICY "client_stay_extension_requests_tenant_all"
  ON client_stay_extension_requests FOR ALL
  USING (tenant_id = get_current_user_tenant_id())
  WITH CHECK (tenant_id = get_current_user_tenant_id());

-- ----------------------------------------------------------------------------
-- 5. REALTIME : publie la table pour que le panneau de demandes du tableau de
--    bord Réservations se mette à jour en temps réel.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_stay_extension_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_stay_extension_requests;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. FONCTION: request_stay_extension(p_token, p_new_check_out_date, p_message)
--    Crée une demande de prolongation depuis l'espace client et notifie le
--    personnel. Vérifie la disponibilité de la chambre sur la période demandée.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_stay_extension(
  p_token                TEXT,
  p_new_check_out_date   DATE,
  p_message              TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session     client_sessions;
  v_booking     bookings;
  v_plan        TEXT;
  v_available   BOOLEAN;
  v_request     client_stay_extension_requests;
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

  IF p_new_check_out_date IS NULL OR p_new_check_out_date <= v_booking.check_out_date THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'La nouvelle date de départ doit être postérieure au départ actuel.');
  END IF;

  -- Vérification anti double-booking sur la période prolongée
  SELECT check_double_booking(
    v_booking.room_id,
    v_booking.check_in_date,
    p_new_check_out_date,
    v_booking.id
  ) INTO v_available;

  IF NOT v_available THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'La chambre n''est pas disponible sur la période demandée.');
  END IF;

  INSERT INTO client_stay_extension_requests (
    tenant_id, booking_id, client_id, requested_check_out_date, message, status
  )
  VALUES (
    v_booking.tenant_id, v_booking.id, v_session.client_id,
    p_new_check_out_date, NULLIF(p_message, ''), 'pending'
  )
  RETURNING * INTO v_request;

  SELECT full_name INTO v_client_name FROM clients WHERE id = v_session.client_id;
  SELECT room_number INTO v_room_number FROM rooms WHERE id = v_booking.room_id;

  PERFORM create_system_notification(
    v_booking.tenant_id,
    NULL,
    'Demande de prolongation de séjour',
    COALESCE(v_client_name, 'Client') || ' · Chambre ' || COALESCE(v_room_number, '') ||
      ' · départ souhaité le ' || to_char(v_request.requested_check_out_date, 'DD/MM/YYYY') ||
      ' (' || (v_request.requested_check_out_date - v_booking.check_out_date) || ' nuit(s) de plus)' ||
      CASE WHEN v_request.message IS NOT NULL THEN ' · « ' || v_request.message || ' »' ELSE '' END,
    'info',
    '/dashboard/bookings'
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id', v_request.id,
    'requested_check_out_date', v_request.requested_check_out_date,
    'status', v_request.status
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. FONCTION: process_stay_extension(p_request_id, p_decision, p_user_id)
--    Traite une demande de prolongation côté personnel : 'approved' (la
--    prolongation a été appliquée via extend_booking) ou 'rejected'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_stay_extension(
  p_request_id UUID,
  p_decision   TEXT,
  p_user_id    UUID,
  p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request     client_stay_extension_requests;
  v_room_number TEXT;
  v_client_name TEXT;
  v_label       TEXT;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Décision invalide.');
  END IF;

  SELECT * INTO v_request
  FROM client_stay_extension_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Demande introuvable ou déjà traitée.');
  END IF;

  UPDATE client_stay_extension_requests
  SET status        = p_decision,
      processed_at  = NOW(),
      processed_by  = p_user_id,
      processed_note = NULLIF(p_note, '')
  WHERE id = p_request_id;

  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (
    v_request.tenant_id,
    CASE WHEN p_decision = 'approved' THEN 'stay_extension_approved' ELSE 'stay_extension_rejected' END,
    'booking',
    v_request.booking_id,
    jsonb_build_object(
      'request_id', v_request.id,
      'requested_check_out_date', v_request.requested_check_out_date,
      'processed_by', p_user_id
    ),
    NOW()
  );

  SELECT room_number INTO v_room_number FROM rooms WHERE id =
    (SELECT room_id FROM bookings WHERE id = v_request.booking_id);
  SELECT full_name INTO v_client_name FROM clients WHERE id = v_request.client_id;

  IF p_decision = 'approved' THEN
    v_label := 'Prolongation acceptée';
  ELSE
    v_label := 'Prolongation refusée';
  END IF;

  PERFORM create_system_notification(
    v_request.tenant_id,
    NULL,
    v_label,
    COALESCE(v_client_name, 'Client') || ' · Chambre ' || COALESCE(v_room_number, '') ||
      CASE WHEN p_decision = 'approved'
        THEN ' · demande de départ au ' || to_char(v_request.requested_check_out_date, 'DD/MM/YYYY') || ' acceptée.'
        ELSE ' · demande de départ au ' || to_char(v_request.requested_check_out_date, 'DD/MM/YYYY') || ' refusée.' END,
    CASE WHEN p_decision = 'approved' THEN 'success' ELSE 'warning' END,
    '/dashboard/bookings'
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'id', v_request.id,
    'status', p_decision
  );
END;
$$;
