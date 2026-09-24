-- Fix external booking authorization context.
-- External bookings are authenticated at the HTTP boundary by x-api-key.
-- They must not require auth.uid(), while internal bookings remain user-authenticated.

CREATE OR REPLACE FUNCTION public.create_booking(
  p_tenant_id UUID, p_accommodation_id UUID, p_room_id UUID, p_client_id UUID,
  p_check_in_date DATE, p_check_out_date DATE, p_base_price INTEGER,
  p_negotiated_price INTEGER, p_nights_count INTEGER, p_total_amount INTEGER,
  p_created_by UUID, p_check_in_time TIME DEFAULT '14:00',
  p_check_out_time TIME DEFAULT '11:00', p_number_of_guests INTEGER DEFAULT 1,
  p_special_requests TEXT DEFAULT NULL, p_booking_source booking_source DEFAULT 'manual',
  p_initial_status booking_status DEFAULT 'confirmed', p_is_third_party BOOLEAN DEFAULT FALSE,
  p_occupant_full_name TEXT DEFAULT NULL, p_occupant_phone TEXT DEFAULT NULL,
  p_occupant_id_type TEXT DEFAULT NULL, p_occupant_id_number TEXT DEFAULT NULL,
  p_occupant_nationality TEXT DEFAULT NULL, p_occupant_address TEXT DEFAULT NULL,
  p_id_registration_status TEXT DEFAULT 'not_required'
)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_booking bookings;
  v_code text;
  v_is_available boolean;
  v_check_out_time time;
  v_tourist_tax_amount integer := 0;
  v_nights integer;
  v_total integer;
  v_current_tenant uuid;
  v_current_role user_role;
  v_creator_valid boolean := false;
BEGIN
  IF p_booking_source = 'external' THEN
    SELECT tenant_id, role, is_active
      INTO v_current_tenant, v_current_role, v_creator_valid
    FROM public.users
    WHERE id = p_created_by;

    IF NOT v_creator_valid
       OR v_current_tenant IS DISTINCT FROM p_tenant_id
       OR v_current_role NOT IN ('admin_residence', 'receptionniste') THEN
      RAISE EXCEPTION 'FORBIDDEN: Créateur externe invalide pour cet établissement';
    END IF;
  ELSE
    PERFORM public.assert_current_user(p_created_by);
    SELECT tenant_id, role INTO v_current_tenant, v_current_role
    FROM public.users
    WHERE id = p_created_by AND auth_user_id = auth.uid();

    IF v_current_tenant IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Vous ne pouvez créer une réservation que pour votre établissement';
    END IF;
    IF v_current_role NOT IN ('admin_residence', 'receptionniste') THEN
      RAISE EXCEPTION 'FORBIDDEN: Vous n''êtes pas autorisé à créer une réservation';
    END IF;
  END IF;

  IF p_check_in_date IS NULL OR p_check_out_date IS NULL OR p_check_out_date <= p_check_in_date THEN
    RAISE EXCEPTION 'INVALID_DATES: La date de départ doit être après la date d''arrivée';
  END IF;
  IF p_negotiated_price IS NULL OR p_negotiated_price <= 0 OR p_base_price < 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: Le prix de réservation est invalide';
  END IF;
  IF p_number_of_guests IS NULL OR p_number_of_guests < 1 THEN
    RAISE EXCEPTION 'INVALID_GUESTS: Le nombre de voyageurs doit être supérieur à 0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accommodations WHERE id = p_accommodation_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Établissement invalide';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id = p_room_id AND accommodation_id = p_accommodation_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Chambre invalide pour cet établissement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Client invalide pour cet établissement';
  END IF;

  v_nights := p_check_out_date - p_check_in_date;
  v_total := p_negotiated_price * v_nights;
  SELECT public.check_double_booking(p_room_id, p_check_in_date, p_check_out_date) INTO v_is_available;
  IF NOT v_is_available THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: Cette chambre est déjà réservée pour ces dates';
  END IF;

  SELECT COALESCE(p_check_out_time,
    (SELECT rt.check_out_time FROM public.rooms r JOIN public.room_types rt ON rt.id = r.room_type_id WHERE r.id = p_room_id),
    TIME '11:00') INTO v_check_out_time;
  SELECT public.generate_booking_code(p_tenant_id) INTO v_code;

  SELECT CASE WHEN a.tourist_tax_enabled AND a.tourist_tax_rate IS NOT NULL
    THEN a.tourist_tax_rate * v_nights * GREATEST(p_number_of_guests, 1) ELSE 0 END
  INTO v_tourist_tax_amount
  FROM public.accommodations a WHERE a.id = p_accommodation_id;

  INSERT INTO public.bookings (
    tenant_id, accommodation_id, room_id, client_id, booking_code, check_in_date, check_out_date,
    check_in_time, check_out_time, base_price, negotiated_price, nights_count, total_amount,
    tourist_tax_amount, number_of_guests, special_requests, created_by, status, booking_source,
    is_third_party, occupant_full_name, occupant_phone, occupant_id_type, occupant_id_number,
    occupant_nationality, occupant_address, id_registration_status
  ) VALUES (
    p_tenant_id, p_accommodation_id, p_room_id, p_client_id, v_code, p_check_in_date, p_check_out_date,
    p_check_in_time, v_check_out_time, p_base_price, p_negotiated_price, v_nights, v_total,
    COALESCE(v_tourist_tax_amount, 0), p_number_of_guests, p_special_requests, p_created_by,
    p_initial_status, p_booking_source, p_is_third_party, p_occupant_full_name, p_occupant_phone,
    p_occupant_id_type, p_occupant_id_number, p_occupant_nationality, p_occupant_address,
    p_id_registration_status
  )
  RETURNING * INTO v_booking;
  RETURN v_booking;
END;
$function$;
