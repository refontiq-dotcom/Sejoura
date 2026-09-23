-- Preserve room availability when cancelling a checked-in booking.
DO $$
DECLARE ddl text;
BEGIN
  SELECT pg_get_functiondef('public.cancel_booking(uuid,uuid,text)'::regprocedure) INTO ddl;
  ddl := replace(ddl, '  v_booking bookings;\nBEGIN',
    '  v_booking bookings;\n  v_was_checked_in BOOLEAN;\nBEGIN');
  ddl := replace(ddl,
    '  PERFORM public.assert_current_user_can_access_booking(p_booking_id, p_user_id);\n  PERFORM public.assert_booking_operator(p_user_id);',
    '  PERFORM public.assert_current_user_can_access_booking(p_booking_id, p_user_id);\n  PERFORM public.assert_booking_operator(p_user_id);\n  SELECT (status = ''checked_in'') INTO v_was_checked_in FROM public.bookings WHERE id = p_booking_id FOR UPDATE;');
  ddl := replace(ddl, '  IF v_booking.status = ''checked_in'' THEN',
    '  IF COALESCE(v_was_checked_in, FALSE) THEN');
  EXECUTE ddl;
END $$;