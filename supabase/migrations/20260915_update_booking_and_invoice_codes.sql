-- Mise à jour de la fonction de génération du code de réservation
CREATE OR REPLACE FUNCTION generate_booking_code(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_max_id INTEGER;
  v_code TEXT;
  v_year TEXT;
BEGIN
  -- Format année sur 2 chiffres (ex: 26 pour 2026)
  v_year := TO_CHAR(NOW(), 'YY');
  
  -- Trouver le plus grand numéro de séquence utilisé cette année par ce tenant pour le format RES
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
