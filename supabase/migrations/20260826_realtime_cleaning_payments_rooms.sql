-- ============================================================================
-- Migration : publier cleaning_tasks, payments, rooms sur Supabase Realtime
-- ============================================================================
-- Le tableau de bord s'abonne aux changements de ces tables pour rafraîchir
-- instantanément les compteurs ménage, revenus et statut des chambres.
-- Actuellement seuls bookings est publié → les compteurs ménage/chambres ne
-- se mettent à jour que via le polling (≤ 30 s). Cette migration comble le
-- trou.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['cleaning_tasks', 'payments', 'rooms']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
