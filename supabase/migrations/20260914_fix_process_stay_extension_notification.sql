-- ============================================================================
-- Migration : corriger process_stay_extension() pour éviter l'auto-notification
-- ============================================================================
-- Prerequis : la table stay_extension_requests doit exister.
-- Si cette table n'existe pas encore, cette migration est sans effet
-- (bloc DO ... EXCEPTION WHEN undefined_table).

DO $$
BEGIN
  -- Vérifier que la table stay_extension_requests existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'stay_extension_requests'
      AND schemaname = 'public'
  ) THEN
    RAISE NOTICE 'stay_extension_requests n''existe pas encore : process_stay_extension non modifié.';
    RETURN;
  END IF;

  EXECUTE $body$
    CREATE OR REPLACE FUNCTION process_stay_extension(
      p_request_id UUID,
      p_decision TEXT,
      p_user_id UUID
    )
    RETURNS JSONB AS $$
    DECLARE
      v_request stay_extension_requests;
      v_client_name TEXT;
      v_room_number TEXT;
      v_label TEXT;
    BEGIN
      SELECT * INTO v_request
      FROM stay_extension_requests
      WHERE id = p_request_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', FALSE, 'error', 'Demande introuvable');
      END IF;

      IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('ok', FALSE, 'error', 'Demande déjà traitée');
      END IF;

      IF p_decision NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('ok', FALSE, 'error', 'Décision invalide');
      END IF;

      UPDATE stay_extension_requests
      SET status = p_decision,
          processed_by = p_user_id,
          processed_at = NOW()
      WHERE id = p_request_id;

      INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
      VALUES (v_request.tenant_id, 'stay_extension_' || p_decision, 'stay_extension_request', v_request.id,
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
        '/dashboard/bookings',
        NULL,
        p_user_id
      );

      RETURN jsonb_build_object(
        'ok', TRUE,
        'id', v_request.id,
        'status', p_decision
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  $body$;
END;
$$;
