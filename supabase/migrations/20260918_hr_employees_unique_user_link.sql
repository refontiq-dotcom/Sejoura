-- ============================================================================
-- Migration : Un seul dossier RH par compte système lié
-- Date      : 2026-09-18
-- ============================================================================
-- Contexte : la page /dashboard/hr permet désormais de lier un dossier RH à
-- un compte système existant (users.id), pour éviter de ressaisir deux fois
-- les mêmes informations. L'interface exclut déjà les comptes déjà liés à un
-- autre dossier, mais rien ne l'empêchait au niveau base — deux requêtes
-- simultanées, par exemple, auraient pu lier le même compte deux fois.
--
-- Index unique partiel : autorise plusieurs dossiers avec user_id = NULL
-- (personnes sans accès à l'application), mais garantit qu'un compte donné
-- n'est jamais lié qu'à un seul dossier RH à la fois.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_unique_user
  ON hr_employees(user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON INDEX idx_hr_employees_unique_user
  IS 'Un compte système (users.id) ne peut être lié qu''à un seul dossier RH à la fois.';
