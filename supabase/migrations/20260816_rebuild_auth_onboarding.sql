-- ============================================================================
-- SÉJOURA — Rebuild Auth / Inscription / Onboarding
--
-- Reconstruit de zéro le cœur d'authentification : les tables
--   public.tenants, public.accommodations, public.users
-- ainsi que le trigger de création de profil au signup et les politiques RLS.
--
-- SÛRE ET IDEMPOTENTE :
--   * AUCUN DROP TABLE ... CASCADE. Les tables métier (rooms, room_types,
--     bookings, clients, subscriptions, ...) ne sont jamais touchées.
--   * CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS :
--     les colonnes accumulées par les migrations ultérieures (branding,
--     i18n, boosts Trouvetou, PIN employé, ...) sont réintégrées, les clés
--     étrangères tenant_id / accommodation_id continuent de pointer vers les
--     tables reconstruites.
--   * Exécutable dans le SQL Editor Supabase, sur la base de production
--     existante comme sur une base neuve.
--
-- Objectifs fonctionnels :
--   1. Trigger on_auth_user_created -> public.handle_new_user() (étape 1 :
--      profil créé au signup, rôle lu dans les métadonnées, défaut 'client').
--   2. Politiques RLS simples : lecture/écriture du profil propre et des
--      données du tenant / établissement sans bloquer le frontend.
--   3. Étape 2 (onboarding) décidée côté serveur (/api/auth/onboarding-status)
--      : admin_residence sans établissement -> formulaire de création.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TYPES ÉNUMÉRÉS
-- ----------------------------------------------------------------------------

-- Rôles utilisateurs
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'super_admin',       -- Super Admin Séjoura
    'admin_residence',   -- Admin Résidence (propriétaire)
    'receptionniste',    -- Réceptionniste
    'menagere',          -- Ménagère
    'client'             -- Client (accès temporaire)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Langues de l'interface
DO $$ BEGIN
  CREATE TYPE user_language AS ENUM ('fr', 'en');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Modes d'affichage
DO $$ BEGIN
  CREATE TYPE theme_mode AS ENUM ('light', 'dark');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. FONCTIONS HELPER (RLS)
-- ----------------------------------------------------------------------------

-- tenant_id de l'utilisateur connecté
CREATE OR REPLACE FUNCTION get_current_user_tenant_id()
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM users
  WHERE auth_user_id = auth.uid();
  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- rôle de l'utilisateur connecté
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM users
  WHERE auth_user_id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- l'utilisateur connecté est-il super_admin ?
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- trigger updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. TABLE: tenants (Entreprises / Espaces inscrits)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name       TEXT NOT NULL,
  contact_name       TEXT NOT NULL,
  contact_email      TEXT NOT NULL UNIQUE,
  contact_phone      TEXT NOT NULL,
  country            TEXT DEFAULT 'Côte d''Ivoire',
  city               TEXT,
  address            TEXT,
  logo_url           TEXT,
  is_suspended       BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_reason   TEXT,
  suspended_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Colonnes cumulées des migrations ultérieures
  primary_color      TEXT NOT NULL DEFAULT '#6366f1',
  language           user_language NOT NULL DEFAULT 'fr',
  theme_mode         theme_mode NOT NULL DEFAULT 'dark',
  theme_color        TEXT DEFAULT '#0C1C33',
  default_currency   TEXT DEFAULT 'XOF',
  default_currency_symbol TEXT DEFAULT 'FCFA',
  default_language   TEXT DEFAULT 'fr'
);

-- Garantie d'idempotence sur une base existante partiellement migrée
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS language user_language NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS theme_mode theme_mode NOT NULL DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#0C1C33',
  ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS default_currency_symbol TEXT DEFAULT 'FCFA',
  ADD COLUMN IF NOT EXISTS default_language TEXT DEFAULT 'fr';

-- ----------------------------------------------------------------------------
-- 4. TABLE: accommodations (Résidences / Établissements)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accommodations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  address          TEXT,
  city             TEXT,
  country          TEXT DEFAULT 'Côte d''Ivoire',
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  contact_phone    TEXT,
  total_rooms      INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Colonnes cumulées des migrations ultérieures
  currency         TEXT DEFAULT 'XOF',
  currency_symbol  TEXT DEFAULT 'FCFA',
  phone_code       TEXT DEFAULT '+225',
  language         TEXT DEFAULT 'fr',
  logo_url         TEXT,
  theme_color      TEXT DEFAULT '#0C1C33',
  is_boosted       BOOLEAN NOT NULL DEFAULT FALSE,
  boost_expires_at TIMESTAMPTZ,
  is_permanently_boosted BOOLEAN NOT NULL DEFAULT FALSE,
  boost_express_expires_at TIMESTAMPTZ,
  boost_express_price_paid INTEGER DEFAULT 0
);

ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT 'FCFA',
  ADD COLUMN IF NOT EXISTS phone_code TEXT DEFAULT '+225',
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#0C1C33',
  ADD COLUMN IF NOT EXISTS is_boosted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boost_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_permanently_boosted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boost_express_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boost_express_price_paid INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_accommodations_tenant ON accommodations(tenant_id);

-- ----------------------------------------------------------------------------
-- 5. TABLE: users (Utilisateurs — tous rôles confondus)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL pour super_admin / étape 2 non terminée
  auth_user_id    UUID UNIQUE, -- Référence vers auth.users (Supabase Auth)
  role            user_role NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT,
  password_hash   TEXT, -- NULL jusqu'à la 1re connexion (activation)
  is_active       BOOLEAN NOT NULL DEFAULT FALSE, -- Inactif jusqu'à activation
  activated_at    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Colonnes cumulées des migrations ultérieures
  pin_code        TEXT DEFAULT NULL,
  first_login     BOOLEAN NOT NULL DEFAULT TRUE,
  accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_code TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_login BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_auth ON users(auth_user_id);

-- ----------------------------------------------------------------------------
-- 6. TRIGGER: création du profil au signup (étape 1)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, email, role, full_name, phone, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('super_admin', 'admin_residence', 'receptionniste', 'menagere', 'client')
      THEN (NEW.raw_user_meta_data->>'role')::public.user_role
      ELSE 'client'::public.user_role
    END,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    TRUE
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 7. TRIGGERS: updated_at sur les tables reconstruites
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_tenants_updated ON tenants;
CREATE TRIGGER trigger_tenants_updated BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_accommodations_updated ON accommodations;
CREATE TRIGGER trigger_accommodations_updated BEFORE UPDATE ON accommodations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_users_updated ON users;
CREATE TRIGGER trigger_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 8. TABLE: user_preferences (préférences d'interface, non bloquante)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language user_language NOT NULL DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- ----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY — politiques simples et fonctionnelles
-- ----------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodations ENABLE ROW LEVEL SECURITY;

-- ── tenants ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenants_select_super_admin" ON tenants;
CREATE POLICY "tenants_select_super_admin" ON tenants
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "tenants_insert_public" ON tenants;
CREATE POLICY "tenants_insert_public" ON tenants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL); -- inscription d'un nouvel espace

DROP POLICY IF EXISTS "tenants_update_super_admin" ON tenants;
CREATE POLICY "tenants_update_super_admin" ON tenants
  FOR UPDATE USING (is_super_admin());

DROP POLICY IF EXISTS "tenants_update_own" ON tenants;
CREATE POLICY "tenants_update_own" ON tenants
  FOR UPDATE USING (
    id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- ── users ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select_super_admin" ON users;
CREATE POLICY "users_select_super_admin" ON users
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "users_select_self" ON users;
CREATE POLICY "users_select_self" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "users_select_same_tenant" ON users;
CREATE POLICY "users_select_same_tenant" ON users
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "users_insert_admin" ON users;
CREATE POLICY "users_insert_admin" ON users
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "users_insert_super_admin" ON users;
CREATE POLICY "users_insert_super_admin" ON users
  FOR INSERT WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "users_update_self" ON users;
CREATE POLICY "users_update_self" ON users
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_admin" ON users;
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "users_update_super_admin" ON users;
CREATE POLICY "users_update_super_admin" ON users
  FOR UPDATE USING (is_super_admin());

DROP POLICY IF EXISTS "users_delete_admin" ON users;
CREATE POLICY "users_delete_admin" ON users
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "users_delete_super_admin" ON users;
CREATE POLICY "users_delete_super_admin" ON users
  FOR DELETE USING (is_super_admin());

-- ── accommodations ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "accommodations_select_super_admin" ON accommodations;
CREATE POLICY "accommodations_select_super_admin" ON accommodations
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "accommodations_select_own_tenant" ON accommodations;
CREATE POLICY "accommodations_select_own_tenant" ON accommodations
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "accommodations_insert_admin" ON accommodations;
CREATE POLICY "accommodations_insert_admin" ON accommodations
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "accommodations_insert_super_admin" ON accommodations;
CREATE POLICY "accommodations_insert_super_admin" ON accommodations
  FOR INSERT WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "accommodations_update_admin" ON accommodations;
CREATE POLICY "accommodations_update_admin" ON accommodations
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "accommodations_update_super_admin" ON accommodations;
CREATE POLICY "accommodations_update_super_admin" ON accommodations
  FOR UPDATE USING (is_super_admin());

DROP POLICY IF EXISTS "accommodations_delete_admin" ON accommodations;
CREATE POLICY "accommodations_delete_admin" ON accommodations
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "accommodations_delete_super_admin" ON accommodations;
CREATE POLICY "accommodations_delete_super_admin" ON accommodations
  FOR DELETE USING (is_super_admin());
