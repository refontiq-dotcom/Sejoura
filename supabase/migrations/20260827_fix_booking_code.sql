-- 1. Rendre le booking_code unique PAR tenant, et non globalement
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_booking_code_key;
ALTER TABLE bookings ADD CONSTRAINT bookings_tenant_booking_code_key UNIQUE(tenant_id, booking_code);

-- 2. Améliorer la génération du code pour éviter les collisions suite aux suppressions
CREATE OR REPLACE FUNCTION generate_booking_code(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_max_id INTEGER;
  v_code TEXT;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  
  -- Trouver le plus grand numéro de séquence utilisé cette année par ce tenant
  SELECT COALESCE(
    MAX(
      SUBSTRING(booking_code FROM 'SJ-' || v_year || '-([0-9]+)')::INTEGER
    ), 0
  ) INTO v_max_id
  FROM bookings
  WHERE tenant_id = p_tenant_id
    AND booking_code LIKE 'SJ-' || v_year || '-%';

  -- Incrémenter et formater (ex: SJ-2026-0011)
  v_code := 'SJ-' || v_year || '-' || LPAD((v_max_id + 1)::TEXT, 4, '0');
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
