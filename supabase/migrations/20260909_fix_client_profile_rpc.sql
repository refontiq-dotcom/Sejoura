-- Fix: recreate compute_client_profile and get_client_profile with error handling
-- The ... in stay_notes/booking_extensions queries cause crashes when tables don't exist

CREATE OR REPLACE FUNCTION compute_client_profile(p_client_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant UUID;
  v_stay_count INT := 0;
  v_total_nights INT := 0;
  v_total_revenue INT := 0;
  v_total_paid INT := 0;
  v_avg_stay_amount INT := 0;
  v_preferred_room TEXT := NULL;
  v_last_stay DATE := NULL;
  v_no_shows INT := 0;
  v_cancelled INT := 0;
  v_overstays INT := 0;
  v_fully_paid_count INT := 0;
  v_open_balance INT := 0;
  v_neg_weight INT := 0;
  v_forgotten INT := 0;
  v_reliability NUMERIC;
  v_behavior NUMERIC;
  v_loyalty NUMERIC;
  v_value NUMERIC;
  v_total INT;
  v_tier TEXT;
  v_fully_paid_ratio NUMERIC;
  v_months_since INT;
  v_signals jsonb := '[]'::jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant FROM clients WHERE id = p_client_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COUNT(*), COALESCE(SUM(nights_count), 0), COALESCE(SUM(total_amount), 0), COALESCE(SUM(amount_paid), 0)
  INTO v_stay_count, v_total_nights, v_total_revenue, v_total_paid
  FROM bookings WHERE client_id = p_client_id AND status NOT IN ('cancelled', 'no_show');

  v_avg_stay_amount := CASE WHEN v_stay_count > 0 THEN v_total_revenue / v_stay_count ELSE 0 END;

  BEGIN
    SELECT rt.name INTO v_preferred_room FROM bookings b
    JOIN rooms r ON r.id = b.room_id JOIN room_types rt ON rt.id = r.room_type_id
    WHERE b.client_id = p_client_id AND b.status NOT IN ('cancelled', 'no_show')
    GROUP BY rt.name ORDER BY COUNT(*) DESC LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_preferred_room := NULL;
  END;

  SELECT MAX(check_out_date) INTO v_last_stay FROM bookings WHERE client_id = p_client_id AND status = 'checked_out';

  SELECT COUNT(*) FILTER (WHERE status = 'no_show'), COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_no_shows, v_cancelled FROM bookings WHERE client_id = p_client_id;

  BEGIN
    SELECT COUNT(DISTINCT be.booking_id) INTO v_overstays FROM booking_extensions be
    JOIN bookings b ON b.id = be.booking_id WHERE be.source = 'overstay' AND b.client_id = p_client_id;
  EXCEPTION WHEN OTHERS THEN v_overstays := 0;
  END;

  SELECT COALESCE(SUM(total_amount - amount_paid), 0) INTO v_open_balance
  FROM bookings WHERE client_id = p_client_id AND status IN ('confirmed', 'checked_in') AND amount_paid < total_amount;

  SELECT COUNT(*) INTO v_fully_paid_count FROM bookings
  WHERE client_id = p_client_id AND status NOT IN ('cancelled', 'no_show') AND payment_status = 'paid';

  v_reliability := GREATEST(0, 100 - v_no_shows * 25 - v_cancelled * 12 - v_overstays * 20 - CASE WHEN v_open_balance > 0 THEN 20 ELSE 0 END);
  IF v_stay_count > 0 THEN
    v_fully_paid_ratio := v_fully_paid_count::numeric / v_stay_count;
    IF v_fully_paid_ratio >= 0.8 THEN v_reliability := LEAST(100, v_reliability + 8); END IF;
  ELSE v_fully_paid_ratio := 0;
  END IF;

  BEGIN
    SELECT COALESCE(SUM(CASE WHEN note_type IN ('incident', 'damage') AND severity = 'high' THEN 25
      WHEN note_type IN ('incident', 'damage') AND severity = 'medium' THEN 15
      WHEN note_type IN ('incident', 'damage') AND severity = 'low' THEN 6 ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE note_type = 'forgotten_object')
    INTO v_neg_weight, v_forgotten FROM stay_notes WHERE client_id = p_client_id;
  EXCEPTION WHEN OTHERS THEN v_neg_weight := 0; v_forgotten := 0;
  END;

  v_behavior := GREATEST(0, 100 - v_neg_weight);
  IF v_forgotten > 0 THEN v_behavior := LEAST(100, v_behavior + 3 * v_forgotten); END IF;

  IF v_stay_count >= 5 THEN v_loyalty := 100;
  ELSIF v_stay_count = 4 THEN v_loyalty := 85;
  ELSIF v_stay_count = 3 THEN v_loyalty := 70;
  ELSIF v_stay_count = 2 THEN v_loyalty := 55;
  ELSIF v_stay_count = 1 THEN v_loyalty := 35;
  ELSE v_loyalty := 0; END IF;
  IF v_last_stay IS NOT NULL AND v_last_stay >= (CURRENT_DATE - INTERVAL '3 months') THEN
    v_loyalty := LEAST(100, v_loyalty + 15);
  END IF;

  IF v_total_revenue < 25000 THEN v_value := 15;
  ELSIF v_total_revenue < 75000 THEN v_value := 35;
  ELSIF v_total_revenue < 200000 THEN v_value := 55;
  ELSIF v_total_revenue < 500000 THEN v_value := 80;
  ELSE v_value := 100; END IF;
  IF v_avg_stay_amount >= 150000 THEN v_value := LEAST(100, v_value + 10); END IF;

  v_total := ROUND(0.4 * v_reliability + 0.3 * v_behavior + 0.2 * v_loyalty + 0.1 * v_value)::int;
  IF v_total >= 85 THEN v_tier := 'excellent';
  ELSIF v_total >= 70 THEN v_tier := 'bon';
  ELSIF v_total >= 50 THEN v_tier := 'moyen';
  ELSIF v_total >= 30 THEN v_tier := 'a_surveiller';
  ELSE v_tier := 'mauvais'; END IF;

  IF v_no_shows > 0 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'negative', 'text', v_no_shows || ' no-show(s)')); END IF;
  IF v_cancelled > 0 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'negative', 'text', v_cancelled || ' reservation(s) annulee(s)')); END IF;
  IF v_open_balance > 0 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'negative', 'text', 'Solde impaye : ' || v_open_balance || ' FCFA')); END IF;
  IF v_overstays > 0 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'negative', 'text', v_overstays || ' depassement(s) facture(s)')); END IF;
  IF v_neg_weight >= 25 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'negative', 'text', 'Degat ou incident (grava elevee)'));
  ELSIF v_neg_weight > 0 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'negative', 'text', 'Degat ou incident signale')); END IF;
  IF v_stay_count >= 3 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'positive', 'text', 'Client fidele : ' || v_stay_count || ' sejours')); END IF;
  IF v_last_stay IS NOT NULL AND v_last_stay >= (CURRENT_DATE - INTERVAL '3 months') THEN
    v_months_since := GREATEST(1, ROUND(EXTRACT(DAYS FROM (CURRENT_DATE - v_last_stay)) / 30)::int);
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'positive', 'text', 'Sejour recent (il y a ' || v_months_since || ' mois)'));
  END IF;
  IF v_stay_count > 0 AND v_fully_paid_ratio >= 0.8 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'positive', 'text', 'Sejours soldes a ' || ROUND(v_fully_paid_ratio * 100)::int || '%')); END IF;
  IF v_forgotten > 0 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'neutral', 'text', v_forgotten || ' objet(s) oublie(s)')); END IF;
  IF v_stay_count > 0 THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'neutral', 'text', 'Panier moyen : ' || v_avg_stay_amount || ' FCFA / sejour')); END IF;
  IF v_preferred_room IS NOT NULL THEN v_signals := v_signals || jsonb_build_array(jsonb_build_object('tone', 'neutral', 'text', 'Chambre preferee : ' || v_preferred_room)); END IF;

  RETURN jsonb_build_object(
    'stats', jsonb_build_object('stay_count', v_stay_count, 'total_nights', v_total_nights, 'total_revenue', v_total_revenue, 'total_paid', v_total_paid, 'balance_due', GREATEST(0, v_total_revenue - v_total_paid), 'avg_stay_amount', v_avg_stay_amount, 'preferred_room_type', v_preferred_room, 'last_stay_date', v_last_stay),
    'score', jsonb_build_object('total', v_total, 'tier', v_tier, 'dimensions', jsonb_build_object('reliability', v_reliability, 'behavior', v_behavior, 'loyalty', v_loyalty, 'value', v_value)),
    'signals', v_signals
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION get_client_profile(p_client_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant UUID;
  v_client clients%ROWTYPE;
  v_profile jsonb;
  v_err TEXT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM clients WHERE id = p_client_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Client introuvable.'); END IF;

  BEGIN
    IF v_tenant IS DISTINCT FROM get_current_user_tenant_id() THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Acces refuse.');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT * INTO v_client FROM clients WHERE id = p_client_id;

  BEGIN
    v_profile := compute_client_profile(p_client_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    v_profile := jsonb_build_object(
      'stats', jsonb_build_object('stay_count', 0, 'total_nights', 0, 'total_revenue', 0, 'total_paid', 0, 'balance_due', 0, 'avg_stay_amount', 0, 'preferred_room_type', NULL, 'last_stay_date', NULL),
      'score', jsonb_build_object('total', 0, 'tier', 'nouveau', 'dimensions', jsonb_build_object('reliability', 50, 'behavior', 50, 'loyalty', 0, 'value', 0)),
      'signals', jsonb_build_array(jsonb_build_object('tone', 'neutral', 'text', 'Profil en cours de calcul')),
      'error', v_err
    );
  END;

  RETURN jsonb_build_object('ok', TRUE,
    'client', jsonb_build_object('id', v_client.id, 'full_name', v_client.full_name, 'phone', v_client.phone, 'email', v_client.email, 'nationality', v_client.nationality, 'id_type', v_client.id_type, 'id_number', v_client.id_number, 'address', v_client.address, 'emergency_contact', v_client.emergency_contact, 'created_at', v_client.created_at),
    'profile', v_profile
  );
END;
$fn$;
