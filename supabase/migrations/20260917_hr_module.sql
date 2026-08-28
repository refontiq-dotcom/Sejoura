-- ============================================================================
-- Migration : Module RH — Dossiers employés & contrats (MVP)
-- Date      : 2026-09-17
-- ============================================================================
-- Contexte : nouveau module RH, disponible dès le plan CROISSANCE. Version 1
-- volontairement simple : dossier employé + informations de contrat, SANS
-- calcul de paie (fiches de paie, CNPS, ITS) — ce sera une itération future.
--
-- Ce module est distinct de la table `users` (comptes système / accès à
-- l'application) : un dossier RH peut exister pour une personne qui n'a
-- jamais de compte de connexion (ex: gardien de nuit, agent d'entretien
-- externe), d'où le lien optionnel `user_id`.
-- ============================================================================

-- ── 1. Enums ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE hr_contract_type AS ENUM (
    'cdi',        -- Contrat à durée indéterminée
    'cdd',        -- Contrat à durée déterminée
    'stage',      -- Stage
    'journalier', -- Journalier / occasionnel
    'prestataire' -- Prestataire externe
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_employee_status AS ENUM (
    'active',    -- En poste
    'on_leave',  -- En congé
    'terminated' -- Contrat terminé
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_employees (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  accommodation_id    UUID REFERENCES accommodations(id) ON DELETE SET NULL,
  -- Lien optionnel vers un compte système existant (users). NULL si la
  -- personne n'a pas d'accès à l'application.
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,

  full_name           TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT,
  position            TEXT NOT NULL,           -- Poste occupé (libre : "Réceptionniste", "Agent d'entretien"...)
  national_id_number  TEXT,                    -- N° CNI (facultatif)
  birth_date          DATE,
  hire_date           DATE NOT NULL,

  contract_type       hr_contract_type NOT NULL DEFAULT 'cdi',
  contract_start_date DATE NOT NULL,
  contract_end_date   DATE,                    -- NULL pour CDI
  base_salary         INTEGER,                 -- Salaire de base en FCFA (informatif, pas de calcul de paie en v1)
  cnps_number         TEXT,                    -- N° immatriculation CNPS (facultatif)

  status              hr_employee_status NOT NULL DEFAULT 'active',
  termination_date    DATE,
  notes               TEXT,

  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_hr_positive_salary CHECK (base_salary IS NULL OR base_salary >= 0),
  CONSTRAINT chk_hr_contract_dates CHECK (contract_end_date IS NULL OR contract_end_date >= contract_start_date)
);

CREATE INDEX IF NOT EXISTS idx_hr_employees_tenant ON hr_employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_status ON hr_employees(status);
CREATE INDEX IF NOT EXISTS idx_hr_employees_accommodation ON hr_employees(accommodation_id);

-- updated_at automatique (réutilise la fonction générique déjà en place)
DROP TRIGGER IF EXISTS trigger_hr_employees_updated ON hr_employees;
CREATE TRIGGER trigger_hr_employees_updated
  BEFORE UPDATE ON hr_employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── 3. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE hr_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_employees_select_own" ON hr_employees
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "hr_employees_select_super_admin" ON hr_employees
  FOR SELECT USING (is_super_admin());

CREATE POLICY "hr_employees_insert_admin" ON hr_employees
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "hr_employees_update_admin" ON hr_employees
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "hr_employees_delete_admin" ON hr_employees
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- ── 4. Verrou de plan (Croissance et Entreprise uniquement) ────────────────
-- Reflète canAccessFeature('hrModule', plan) côté TypeScript. Contrairement
-- à la comptabilité avancée (Entreprise uniquement), le module RH est
-- disponible dès Croissance.
CREATE OR REPLACE FUNCTION check_hr_module_access()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_plan      TEXT;
BEGIN
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  SELECT plan::TEXT INTO v_plan
  FROM subscriptions
  WHERE tenant_id = v_tenant_id
  LIMIT 1;

  IF v_plan NOT IN ('croissance', 'entreprise', 'enterprise') THEN
    RAISE EXCEPTION
      '[Plan] Le module RH (dossiers employés) est réservé aux formules Croissance et Entreprise.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_hr_employees_plan ON hr_employees;
CREATE TRIGGER trigger_check_hr_employees_plan
  BEFORE INSERT OR UPDATE OR DELETE ON hr_employees
  FOR EACH ROW
  EXECUTE FUNCTION check_hr_module_access();

COMMENT ON TABLE hr_employees
  IS 'Dossiers RH (informations employé + contrat). V1 : sans calcul de paie. Disponible dès le plan Croissance.';
