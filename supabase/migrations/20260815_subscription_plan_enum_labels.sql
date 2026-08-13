-- Ajouter les labels de formule manquants à l'enum subscription_plan.
-- L'application stocke 'free' / 'essentiel' / 'entreprise' (labels
-- normalizePlan) dans subscriptions.plan et les lit via des comparaisons
-- directes. L'enum recréé par le reset ne contenait que 'standard' et
-- 'enterprise' : l'INSERT d'une souscription échouait avec
-- « invalid input value for enum subscription_plan » → erreur 500 à l'étape 2.

DO $$ BEGIN
  ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'free';
  ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'essentiel';
  ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'entreprise';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
