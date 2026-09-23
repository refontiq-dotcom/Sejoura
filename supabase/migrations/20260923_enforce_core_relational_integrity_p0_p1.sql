-- Phase 2 P0/P1: enforce cross-table tenant and ownership consistency.
CREATE OR REPLACE FUNCTION public.validate_booking_relational_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_room_tenant uuid; v_room_accommodation uuid; v_accommodation_tenant uuid; v_client_tenant uuid;
BEGIN
  SELECT tenant_id, accommodation_id INTO v_room_tenant, v_room_accommodation FROM public.rooms WHERE id = NEW.room_id;
  SELECT tenant_id INTO v_accommodation_tenant FROM public.accommodations WHERE id = NEW.accommodation_id;
  SELECT tenant_id INTO v_client_tenant FROM public.clients WHERE id = NEW.client_id;
  IF v_room_tenant IS NULL OR v_accommodation_tenant IS NULL OR v_client_tenant IS NULL THEN RAISE EXCEPTION 'INTEGRITY_ERROR: Références de réservation invalides'; END IF;
  IF NEW.tenant_id IS DISTINCT FROM v_room_tenant OR NEW.tenant_id IS DISTINCT FROM v_accommodation_tenant OR NEW.tenant_id IS DISTINCT FROM v_client_tenant THEN RAISE EXCEPTION 'INTEGRITY_ERROR: Les références de réservation doivent appartenir au même tenant'; END IF;
  IF v_room_accommodation IS DISTINCT FROM NEW.accommodation_id THEN RAISE EXCEPTION 'INTEGRITY_ERROR: La chambre n''appartient pas à cet établissement'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_validate_booking_relational_integrity ON public.bookings;
CREATE TRIGGER trg_validate_booking_relational_integrity BEFORE INSERT OR UPDATE OF tenant_id, accommodation_id, room_id, client_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.validate_booking_relational_integrity();

CREATE OR REPLACE FUNCTION public.validate_payment_relational_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_booking_tenant uuid; v_booking_accommodation uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT tenant_id, accommodation_id INTO v_booking_tenant, v_booking_accommodation FROM public.bookings WHERE id = NEW.booking_id;
    IF v_booking_tenant IS NULL THEN RAISE EXCEPTION 'INTEGRITY_ERROR: Réservation de paiement introuvable'; END IF;
    IF NEW.tenant_id IS DISTINCT FROM v_booking_tenant THEN RAISE EXCEPTION 'INTEGRITY_ERROR: Le paiement et la réservation doivent appartenir au même tenant'; END IF;
    IF NEW.accommodation_id IS NOT NULL AND NEW.accommodation_id IS DISTINCT FROM v_booking_accommodation THEN RAISE EXCEPTION 'INTEGRITY_ERROR: L''établissement du paiement ne correspond pas à la réservation'; END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_validate_payment_relational_integrity ON public.payments;
CREATE TRIGGER trg_validate_payment_relational_integrity BEFORE INSERT OR UPDATE OF tenant_id, booking_id, accommodation_id ON public.payments FOR EACH ROW EXECUTE FUNCTION public.validate_payment_relational_integrity();
REVOKE ALL ON FUNCTION public.validate_booking_relational_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_payment_relational_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_booking_relational_integrity() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_payment_relational_integrity() TO service_role;