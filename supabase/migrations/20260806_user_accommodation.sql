-- Migration: Gestion multi-établissements & mobilité des employés
-- Date: 2026-08-06

-- ============================================================
-- PARTIE 1 : Résidence de base permanente sur users
-- ============================================================

-- Ajouter la colonne accommodation_id à la table users (résidence de base)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL;

-- Index pour de meilleures performances
CREATE INDEX IF NOT EXISTS idx_users_accommodation ON users(accommodation_id);

COMMENT ON COLUMN users.accommodation_id IS 'Résidence de base permanente de l''employé (NULL = tous les établissements pour les admins)';

-- ============================================================
-- PARTIE 2 : Table d'affectations pour la mobilité
-- ============================================================

-- Table des affectations d'employés (historique complet)
CREATE TABLE IF NOT EXISTS employee_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE NULL,          -- NULL = affectation permanente
  notes           TEXT NULL,
  created_by      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Contrainte : end_date doit être >= start_date
  CONSTRAINT chk_assignment_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Index principal pour récupérer l'affectation active d'un employé
CREATE INDEX IF NOT EXISTS idx_emp_assignments_user_date
  ON employee_assignments(user_id, start_date DESC);

-- Index secondaire pour filtrer par établissement
CREATE INDEX IF NOT EXISTS idx_emp_assignments_accommodation
  ON employee_assignments(accommodation_id);

COMMENT ON TABLE employee_assignments IS 'Historique des affectations des employés aux résidences. Permet les déplacements temporaires et permanents.';
COMMENT ON COLUMN employee_assignments.end_date IS 'NULL = affectation permanente. Si renseigné = affectation temporaire jusqu''à cette date.';

-- ============================================================
-- PARTIE 3 : Fonction utilitaire (affectation active du jour)
-- ============================================================

-- Retourne l'accommodation_id actif pour un employé à la date du jour.
-- Priorise les entrées de employee_assignments sur l'accommodation_id de base.
CREATE OR REPLACE FUNCTION get_active_accommodation_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT accommodation_id
  FROM employee_assignments
  WHERE user_id = p_user_id
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  ORDER BY start_date DESC
  LIMIT 1
$$;

COMMENT ON FUNCTION get_active_accommodation_id IS 'Retourne la résidence active d''un employé à la date du jour (affectation temporaire prioritaire sur résidence de base).';
