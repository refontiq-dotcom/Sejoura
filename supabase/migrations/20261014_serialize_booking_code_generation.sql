-- ============================================================================
-- SÉJOURA — Codes de réservation : supprimer la course entre créations simultanées
--
-- Constat (révélé par tests/external-booking-double-booking.e2e.test.ts, scénario F,
-- sur la vraie base) : generate_booking_code() calcule MAX(numéro) + 1 sans verrou.
-- Deux create_booking() simultanés pour le même établissement lisent le même
-- maximum, produisent le même code (ex. RES-26-0012) et le second INSERT échoue
-- avec 23505 « bookings_tenant_booking_code_key ». Conséquences :
--   * une réservation parfaitement légitime peut échouer au hasard (erreur 500) ;
--   * dans une vraie course sur la même chambre, le perdant reçoit 23505 au lieu
--     de l'erreur « double réservation » (23P01 / DOUBLE_BOOKING) que l'API sait
--     traduire en 409.
--
-- Correctif : verrou consultatif PAR LOCATAIRE, tenu jusqu'à la fin de la
-- transaction appelante (pg_advisory_xact_lock). Le second appelant attend la
-- validation du premier, puis voit son code dans le MAX et prend le suivant.
-- Les locataires différents ne se bloquent pas entre eux.
--
-- Le corps est identique à la version de 20260915_update_booking_and_invoice_codes.sql,
-- plus le verrou et un search_path explicite (bonne pratique SECURITY DEFINER).
-- Idempotente (CREATE OR REPLACE) ; aucun changement de signature.
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_booking_code(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_max_id INTEGER;
  v_code TEXT;
  v_year TEXT;
BEGIN
  -- Sérialise les générations de code d'un même locataire jusqu'au COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtextextended('booking_code:' || p_tenant_id::text, 0));

  -- Format année sur 2 chiffres (ex: 26 pour 2026)
  v_year := TO_CHAR(NOW(), 'YY');

  -- Plus grand numéro de séquence utilisé cette année par ce locataire (format RES)
  SELECT COALESCE(
    MAX(
      SUBSTRING(booking_code FROM 'RES-' || v_year || '-([0-9]+)')::INTEGER
    ), 0
  ) INTO v_max_id
  FROM bookings
  WHERE tenant_id = p_tenant_id
    AND booking_code LIKE 'RES-' || v_year || '-%';

  -- Incrémenter et formater (ex: RES-26-0011)
  v_code := 'RES-' || v_year || '-' || LPAD((v_max_id + 1)::TEXT, 4, '0');

  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
