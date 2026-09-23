-- Phase 10: fix booking integrity validation for the actual rooms schema.
-- rooms is linked to accommodations and does not carry tenant_id.
CREATE OR REPLACE FUNCTION public.validate_booking_relational_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room_accommodation uuid;
  v_accommodation_tenant uuid;
  v_client_tenant uuid;
BEGIN
  SELECT accommodation_id
    INTO v_room_accommodation
  FROM public.rooms
  WHERE id = NEW.room_id;

  SELECT tenant_id
    INTO v_accommodation_tenant
  FROM public.accommodations
  WHERE id = NEW.accommodation_id;

  SELECT tenant_id
    INTO v_client_tenant
  FROM public.clients
  WHERE id = NEW.client_id;

  IF v_room_accommodation IS NULL
     OR v_accommodation_tenant IS NULL
     OR v_client_tenant IS NULL THEN
    RAISE EXCEPTION 'INTEGRITY_ERROR: Références de réservation invalides';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_accommodation_tenant
     OR NEW.tenant_id IS DISTINCT FROM v_client_tenant THEN
    RAISE EXCEPTION 'INTEGRITY_ERROR: Les références de réservation doivent appartenir au même tenant';
  END IF;

  IF v_room_accommodation IS DISTINCT FROM NEW.accommodation_id THEN
    RAISE EXCEPTION 'INTEGRITY_ERROR: La chambre n''appartient pas à cet établissement';
  END IF;

  RETURN NEW;
END;
$$;
