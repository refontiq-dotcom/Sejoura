-- Keep the authorization helper internal. SECURITY DEFINER callers can execute it internally.
REVOKE ALL ON FUNCTION public.assert_booking_operator(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_booking_operator(uuid) TO service_role;