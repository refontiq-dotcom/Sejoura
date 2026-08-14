-- ============================================================================
-- Migration : publier la table bookings sur Supabase Realtime
-- ============================================================================
-- Le tableau de bord et la page Réservations s'abonnent aux changements de
-- bookings (création, modification, check-in/out, paiement) pour se mettre à
-- jour en temps réel. Pour que les événements soient émis, la table doit
-- figurer dans la publication supabase_realtime.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;
