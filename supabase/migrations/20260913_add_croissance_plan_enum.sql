-- ============================================================================
-- Migration : Ajout du palier CROISSANCE à l'enum subscription_plan
-- Date      : 2026-09-13
-- ============================================================================
-- Contexte : nouvelle grille tarifaire à 3 paliers (Essentiel 9 900 FCFA /
-- Croissance 24 900 FCFA / Entreprise 54 900 FCFA). Sans cette valeur, toute
-- tentative d'enregistrer un abonnement 'croissance' échoue avec une erreur
-- "invalid input value for enum subscription_plan".
--
-- NB : ALTER TYPE ... ADD VALUE ne peut pas s'exécuter dans un bloc
-- transactionnel avec d'autres commandes DDL qui l'utilisent immédiatement ;
-- on l'isole donc dans son propre DO block, idempotent via un test préalable.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'croissance'
      AND enumtypid = 'subscription_plan'::regtype
  ) THEN
    ALTER TYPE subscription_plan ADD VALUE 'croissance';
  END IF;
END $$;
