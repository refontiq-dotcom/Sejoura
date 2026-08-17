-- 20260904_client_smart_profile.sql
-- Dossier client intelligent : un profil calculé automatiquement pour chaque
-- client (score de réputation 0-100, 4 dimensions, signaux en langage naturel).
--
--   * compute_client_profile(p_client_id) : le cœur — calcule stats + score +
--     dimensions + signaux (JSONB). 100% automatique, règles transparentes.
--   * client_profiles (vue) : score agrégé par client, pour afficher le badge
--     « partout » dans les listes.
--   * get_client_profile(p_client_id) : RPC pour la fiche client dédiée
--     (vérifie que le client appartient au tenant de l'appelant).
--
-- Modèle de score (0-100, pondéré) :
--   Fiabilité   40%  base 100 − no-shows(25) − annulations(12) −
--                     dépassements(20) − solde impayé(20) ; +8 si séjours soldés.
--   Comportement 30%  base 100 − dégâts/incidents (gravité élevée 25 /
--                     moyenne 15 / faible 6) ; +3 par objet oublié.
--   Fidélité     20%  nb séjours (1→35 … 5+→100) ; +15 si retour < 3 mois.
--   Valeur       10%  CA cumulé (<25k→15 … ≥500k→100) ; +10 si panier ≥150k.
--
-- Idempotent : ré-exécutable sans erreur.

-- ----------------------------------------------------------------------------
-- 1. FONCTION: compute_client_profile(p_client_id) — le cœur du dossier
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_client_profile(p_client_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant             UUID;
  v_stay_count         INT;
  v_total_nights       INT;
  v_total_revenue      INT;
  v_total_paid         INT;
  v_avg_stay_amount    INT;
  v_preferred_room     TEXT;
  v_last_stay          DATE;
  v_no_shows           INT;
  v_cancelled          INT;
  v_overstays          INT;
  v_fully_paid_count   INT;
  v_open_balance       INT;
  v_neg_weight         INT;
  v_forgotten          INT;
  v_reliability        NUMERIC;
  v_behavior           NUMERIC;
  v_loyalty            NUMERIC;
  v_value              NUMERIC;
  v_total              INT;
  v_tier               TEXT;
  v_fully_paid_ratio   NUMERIC;
  v_months_since       INT;
  v_signals            jsonb := '[]'::jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant FROM clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- --- Stats métier ---------------------------------------------------------
  SELECT COUNT(*),
         COALESCE(SUM(nights_count), 0),
         COALESCE(SUM(total_amount), 0),
         COALESCE(SUM(amount_paid), 0)
  INTO v_stay_count, v_total_nights, v_total_revenue, v_total_paid
  FROM bookings
  WHERE client_id = p_client_id
    AND status NOT IN ('cancelled', 'no_show');

  v_avg_stay_amount := CASE WHEN v_stay_count > 0 THEN v_total_revenue / v_stay_count ELSE 0 END;

  SELECT rt.name INTO v_preferred_room
  FROM bookings b
  JOIN rooms r ON r.id = b.room_id
  JOIN room_types rt ON rt.id = r.room_type_id
  WHERE b.client_id = p_client_id
    AND b.status NOT IN ('cancelled', 'no_show')
  GROUP BY rt.name
  ORDER BY COUNT(*) DESC, MAX(b.created_at) DESC
  LIMIT 1;

  SELECT MAX(check_out_date) INTO v_last_stay
  FROM bookings
  WHERE client_id = p_client_id AND status = 'checked_out';

  -- --- Fiabilité ------------------------------------------------------------
  SELECT COUNT(*) FILTER (WHERE status = 'no_show'),
         COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_no_shows, v_cancelled
  FROM bookings
  WHERE client_id = p_client_id;

  SELECT COUNT(DISTINCT be.booking_id)
  INTO v_overstays
  FROM booking_extensions be
  JOIN bookings b ON b.id = be.booking_id
  WHERE be.source = 'overstay' AND b.client_id = p_client_id;

  SELECT COALESCE(SUM(total_amount - amount_paid), 0)
  INTO v_open_balance
  FROM bookings
  WHERE client_id = p_client_id
    AND status IN ('confirmed', 'checked_in')
    AND amount_paid < total_amount;

  SELECT COUNT(*)
  INTO v_fully_paid_count
  FROM bookings
  WHERE client_id = p_client_id
    AND status NOT IN ('cancelled', 'no_show')
    AND payment_status = 'paid';

  v_reliability := GREATEST(0,
    100
    - v_no_shows * 25
    - v_cancelled * 12
    - v_overstays * 20
    - CASE WHEN v_open_balance > 0 THEN 20 ELSE 0 END
  );
  IF v_stay_count > 0 THEN
    v_fully_paid_ratio := v_fully_paid_count::numeric / v_stay_count;
    IF v_fully_paid_ratio >= 0.8 THEN
      v_reliability := LEAST(100, v_reliability + 8);
    END IF;
  END IF;

  -- --- Comportement ---------------------------------------------------------
  SELECT COALESCE(SUM(
          CASE WHEN note_type IN ('incident', 'damage') AND severity = 'high'   THEN 25
               WHEN note_type IN ('incident', 'damage') AND severity = 'medium' THEN 15
               WHEN note_type IN ('incident', 'damage') AND severity = 'low'    THEN 6
               ELSE 0 END
        ), 0),
        COUNT(*) FILTER (WHERE note_type = 'forgotten_object')
  INTO v_neg_weight, v_forgotten
  FROM stay_notes
  WHERE client_id = p_client_id;

  v_behavior := GREATEST(0, 100 - v_neg_weight);
  IF v_forgotten > 0 THEN
    v_behavior := LEAST(100, v_behavior + 3 * v_forgotten);
  END IF;

  -- --- Fidélité -------------------------------------------------------------
  IF v_stay_count >= 5 THEN v_loyalty := 100;
  ELSIF v_stay_count = 4 THEN v_loyalty := 85;
  ELSIF v_stay_count = 3 THEN v_loyalty := 70;
  ELSIF v_stay_count = 2 THEN v_loyalty := 55;
  ELSIF v_stay_count = 1 THEN v_loyalty := 35;
  ELSE v_loyalty := 0;
  END IF;
  IF v_last_stay IS NOT NULL AND v_last_stay >= (CURRENT_DATE - INTERVAL '3 months') THEN
    v_loyalty := LEAST(100, v_loyalty + 15);
  END IF;

  -- --- Valeur ---------------------------------------------------------------
  IF v_total_revenue < 25000 THEN v_value := 15;
  ELSIF v_total_revenue < 75000 THEN v_value := 35;
  ELSIF v_total_revenue < 200000 THEN v_value := 55;
  ELSIF v_total_revenue < 500000 THEN v_value := 80;
  ELSE v_value := 100;
  END IF;
  IF v_avg_stay_amount >= 150000 THEN
    v_value := LEAST(100, v_value + 10);
  END IF;

  -- --- Score global + niveau --------------------------------------------------
  v_total := ROUND(0.4 * v_reliability + 0.3 * v_behavior + 0.2 * v_loyalty + 0.1 * v_value)::int;

  IF v_total >= 85 THEN v_tier := 'excellent';
  ELSIF v_total >= 70 THEN v_tier := 'bon';
  ELSIF v_total >= 50 THEN v_tier := 'moyen';
  ELSIF v_total >= 30 THEN v_tier := 'a_surveiller';
  ELSE v_tier := 'mauvais';
  END IF;

  -- --- Signaux (langage naturel) ---------------------------------------------
  IF v_no_shows > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'negative', 'text', v_no_shows || ' no-show(s) sur ses réservations'));
  END IF;
  IF v_cancelled > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'negative', 'text', v_cancelled || ' réservation(s) annulée(s)'));
  END IF;
  IF v_open_balance > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'negative', 'text', 'Solde impayé : ' || v_open_balance || ' FCFA sur un séjour en cours'));
  END IF;
  IF v_overstays > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'negative', 'text', v_overstays || ' dépassement(s) de séjour facturé(s)'));
  END IF;
  IF v_neg_weight >= 25 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'negative', 'text', 'Dégât ou incident signalé (gravité élevée)'));
  ELSIF v_neg_weight > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'negative', 'text', 'Dégât ou incident signalé (gravité ' ||
      CASE WHEN v_neg_weight >= 15 THEN 'moyenne' ELSE 'faible' END || ')'));
  END IF;
  IF v_stay_count >= 3 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'positive', 'text', 'Client fidèle : ' || v_stay_count || ' séjours'));
  END IF;
  IF v_last_stay IS NOT NULL AND v_last_stay >= (CURRENT_DATE - INTERVAL '3 months') THEN
    v_months_since := GREATEST(1, ROUND(EXTRACT(DAYS FROM (CURRENT_DATE - v_last_stay)) / 30)::int);
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'positive', 'text', 'Séjour récent (il y a ' || v_months_since || ' mois)'));
  END IF;
  IF v_stay_count > 0 AND v_fully_paid_ratio >= 0.8 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'positive', 'text', 'Séjours soldés à ' ||
      ROUND(v_fully_paid_ratio * 100)::int || '%'));
  END IF;
  IF v_forgotten > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'neutral', 'text', v_forgotten || ' objet(s) oublié(s) — retour prévisible'));
  END IF;
  IF v_stay_count > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'neutral', 'text', 'Panier moyen : ' || v_avg_stay_amount || ' FCFA / séjour'));
  END IF;
  IF v_preferred_room IS NOT NULL THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'tone', 'neutral', 'text', 'Chambre préférée : ' || v_preferred_room));
  END IF;

  -- --- Assemblage -------------------------------------------------------------
  RETURN jsonb_build_object(
    'stats', jsonb_build_object(
      'stay_count', v_stay_count,
      'total_nights', v_total_nights,
      'total_revenue', v_total_revenue,
      'total_paid', v_total_paid,
      'balance_due', GREATEST(0, v_total_revenue - v_total_paid),
      'avg_stay_amount', v_avg_stay_amount,
      'preferred_room_type', v_preferred_room,
      'last_stay_date', v_last_stay
    ),
    'score', jsonb_build_object(
      'total', v_total,
      'tier', v_tier,
      'dimensions', jsonb_build_object(
        'reliability', v_reliability,
        'behavior', v_behavior,
        'loyalty', v_loyalty,
        'value', v_value
      )
    ),
    'signals', v_signals
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. VUE: client_profiles — badge de score pour toutes les listes
--
--    NB : le serveur PostgreSQL est en version < 15, où le RLS n'existe pas sur
--    les vues. La sécurisation se fait donc par un filtre direct dans le WHERE
--    (tenant de l'utilisateur connecté via get_current_user_tenant_id()), comme
--    pour les autres vues du projet (v_dashboard_kpis, ...).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW client_profiles AS
SELECT
  c.id                                                       AS client_id,
  c.tenant_id,
  c.full_name,
  c.phone,
  c.email,
  c.nationality,
  (p.data->'stats'->>'stay_count')::int                      AS stay_count,
  (p.data->'stats'->>'total_nights')::int                    AS total_nights,
  (p.data->'stats'->>'total_revenue')::int                   AS total_revenue,
  (p.data->'stats'->>'balance_due')::int                     AS balance_due,
  (p.data->'stats'->>'avg_stay_amount')::int                 AS avg_stay_amount,
  p.data->'stats'->>'preferred_room_type'                    AS preferred_room_type,
  p.data->'stats'->>'last_stay_date'                         AS last_stay_date,
  (p.data->'score'->>'total')::int                           AS score,
  p.data->'score'->>'tier'                                   AS tier
FROM clients c
CROSS JOIN LATERAL (SELECT compute_client_profile(c.id) AS data) AS p
WHERE c.tenant_id = get_current_user_tenant_id();

-- ----------------------------------------------------------------------------
-- 3. RPC: get_client_profile(p_client_id) — fiche complète (avec contrôle
--    d'accès : le client doit appartenir au tenant de l'appelant).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_client_profile(p_client_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant   UUID;
  v_me       UUID;
  v_client   clients%ROWTYPE;
  v_profile  jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant FROM clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Client introuvable.');
  END IF;

  SELECT get_current_user_tenant_id() INTO v_me;
  IF v_tenant IS DISTINCT FROM v_me THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Accès refusé.');
  END IF;

  SELECT * INTO v_client FROM clients WHERE id = p_client_id;
  v_profile := compute_client_profile(p_client_id);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'client', jsonb_build_object(
      'id', v_client.id,
      'full_name', v_client.full_name,
      'phone', v_client.phone,
      'email', v_client.email,
      'nationality', v_client.nationality,
      'id_type', v_client.id_type,
      'id_number', v_client.id_number,
      'address', v_client.address,
      'emergency_contact', v_client.emergency_contact,
      'created_at', v_client.created_at
    ),
    'profile', v_profile
  );
END;
$$;
