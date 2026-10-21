-- ============================================================================
-- RECETTE P0 — Compatibilité RLS français sur public.users
-- Créé APRÈS 20260701_initial_schema.sql (qui DROP la table et détruit
-- les politiques du shim) et AVANT 20260923161234_optimize_p1_indexes_and_rls_policies.sql
-- (qui fait ALTER POLICY sur ces mêmes politiques).
-- ============================================================================
-- Les politiques sont recréées avec la définition du shim (USING true) afin
-- que l'ALTER POLICY de la migration d'optimisation puisse les restreindre.
-- Le bloc DO $$ + pg_policies rend le fichier idempotent.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'Les utilisateurs peuvent lire leur propre profil'
  ) THEN
    CREATE POLICY "Les utilisateurs peuvent lire leur propre profil" ON public.users
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'Les utilisateurs peuvent modifier leur propre profil'
  ) THEN
    CREATE POLICY "Les utilisateurs peuvent modifier leur propre profil" ON public.users
      FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;