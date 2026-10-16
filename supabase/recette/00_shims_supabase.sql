-- ============================================================================
-- RECETTE P0 — Shims Supabase pour PostgreSQL 16 ISOLE (CI uniquement)
-- Fichier : supabase/recette/00_shims_supabase.sql
--
-- But : reproduire dans un PostgreSQL vierge les objets GÉRÉS par Supabase
--       que les migrations historiques supabase/migrations/ référent, afin
--       de rejouer le rejeu intégral SANS toucher à aucune migration.
--       Objets de SERVICE uniquement (schémas auth/storage, rôles, helpers
--       JWT) : les fournir ici ne contourne aucune migration du dépôt.
--
-- AUCUNE donnée de production — AUCUN secret — exécution locale/CI uniquement.
--
-- Contrat auth.uid() : lit la GUC session `request.jwt.claim.sub` posée par
--   les scénarios (SET request.jwt.claim.sub = '<uuid>'; SET ROLE ...).
--   Absente/vide => NULL => le déclencheur P0 fait le bypass service_role,
--   exactement comme en production sans JWT.
-- ============================================================================

-- ── 1. Extensions (aussi créées par les migrations, idempotent) ───────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ── 2. Rôles Supabase ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

-- Schémas de service absents d'un PostgreSQL vierge de recette
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS recette;

-- ── 3. Privilièges (miroir Supabase : tout le public schema + défauts) ───────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA recette TO anon, authenticated, service_role;
-- Les migrations créent les tables APRÈS ce shim (même propriétaire) :
-- les privilièges par défaut s'appliquent à ces créations automatiquement.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- ── 4. Schéma auth : table auth.users + auth.uid() ───────────────────────────
-- Colonnes utilisées par handle_new_user (NEW.id, NEW.email,
-- NEW.raw_user_meta_data) et FK auth.users(id) des migrations.
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ── auth.role() ─────────────────────────────────────────────────────────────
-- Remplaçant de auth.role() de Supabase : retourne 'authenticated' par défaut
-- dans l'environnement de recette (pas de JWT, pas de Supabase GoTrue).
-- Utilisé par les politiques RLS des migrations historiques (ex: feature_requests).
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'authenticated';
$$;

-- ── 4b. Type user_role + cast implicite vers text ─────────────────────────────
-- Le type enum user_role est défini par la migration initiale, mais le shim
-- doit le fournir pour que les politiques RLS des migrations intermédiaires
-- (ex. 20260822_notification_recipient_role) puissent comparer recipient_role
-- (TEXT) avec get_current_user_role() (user_role) sans erreur d'opérateur.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM (
      'super_admin',
      'admin_residence',
      'receptionniste',
      'menagere',
      'client'
    );
  END IF;
END $$;

-- Operateur = (text, user_role) pour resoudre TEXT = user_role
-- (utilise par 20260822_notification_recipient_role: recipient_role TEXT
--  = get_current_user_role() user_role).  Creer UNIQUEMENT l'operateur
--  text = user_role (et non l'inverse) pour eviter l'ambiguite
--  "operator is not unique" sur user_role = unknown dans les politiques
--  de la migration initiale (ex: get_current_user_role() = 'admin_residence').
CREATE OR REPLACE FUNCTION public._text_eq_user_role(t text, ur public.user_role)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT t = ur::text;
$$;

CREATE OPERATOR public.= (
  LEFTARG = text,
  RIGHTARG = public.user_role,
  PROCEDURE = public._text_eq_user_role,
  COMMUTATOR = '='
);

-- Operateur inverse user_role = text (necessaire pour
-- get_current_user_role() = 'admin_residence' dans les politiques RLS).
CREATE OR REPLACE FUNCTION public._user_role_eq_text(ur public.user_role, t text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT ur::text = t;
$$;

CREATE OPERATOR public.= (
  LEFTARG = public.user_role,
  RIGHTARG = text,
  PROCEDURE = public._user_role_eq_text,
  COMMUTATOR = '='
);

-- ── 4c. Helpers de contexte utilisateur (shims, remplacés par les migrations) ─
-- get_current_user_tenant_id() : retourne UUID ; NULL si pas de contexte.
-- Remplacé par supabase/migrations/20260701_initial_schema.sql.
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.tenant_id', true), '')::uuid;
$$;

-- get_current_user_role() : retourne user_role ; NULL si pas de contexte.
-- Remplacé par supabase/migrations/20260701_initial_schema.sql.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')::public.user_role;
$$;

-- is_super_admin() : retourne BOOLEAN.
-- Remplacé par supabase/migrations/20260701_initial_schema.sql.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claim.role', true) = 'super_admin';
$$;

-- ── 4d. Tables référencées par des migrations d'optimisation postérieures ──
-- La migration 20260923161234_optimize_p1_indexes_and_rls_policies crée des
-- indexes sur des tables qui ne sont creees que par des migrations ULTERIEURES
-- (ordre lexicographique). Pour eviter "relation does not exist", on cree ici
-- ces tables avec les colonnes minimales (sans FK, sans index, sans RLS :
-- les migrations ultérieures les compléteront via CREATE TABLE IF NOT EXISTS
-- / CREATE INDEX IF NOT EXISTS / ALTER POLICY).
CREATE TABLE IF NOT EXISTS advertisements (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  created_by              UUID,
  title                   TEXT NOT NULL,
  description             TEXT,
  image_url               TEXT NOT NULL,
  redirect_url            TEXT NOT NULL,
  targeting               JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_days           INTEGER NOT NULL,
  amount                  INTEGER NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'draft',
  starts_at               TIMESTAMPTZ,
  ends_at                 TIMESTAMPTZ,
  sender_phone            TEXT,
  trouvetou_external_id   TEXT,
  trouvetou_synced_at     TIMESTAMPTZ,
  trouvetou_unpublished_at TIMESTAMPTZ,
  trouvetou_is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  trouvetou_sync_error    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advertisement_payment_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  advertisement_id UUID NOT NULL,
  amount          INTEGER NOT NULL,
  duration_days   INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  requested_by    UUID,
  validated_by    UUID,
  validated_at    TIMESTAMPTZ,
  sender_phone    TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- billing_configs : pas de migration de creation dans ce depot, uniquement
-- referencee par ALTER POLICY dans 20260923161234_optimize_p1_indexes_and_rls_policies.
CREATE TABLE IF NOT EXISTS billing_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  config_key  TEXT NOT NULL,
  config_val  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE billing_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'billing_configs' AND policyname = 'billing_configs_read') THEN
    CREATE POLICY "billing_configs_read" ON billing_configs
      FOR SELECT USING ((select auth.uid()) IS NOT NULL);
  END IF;
END $$;

-- ── 5. Schéma storage (buckets référencés par les migrations) ────────────────
CREATE TABLE IF NOT EXISTS storage.buckets (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  public     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  text REFERENCES storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Miroir Supabase : RLS actif sur les objets (politiques créées par les
-- migrations ; hors périmètre P0 — aucune écriture storage sous scénarios).
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- ── 6. Publication realtime (migrations en font IF EXISTS puis ALTER) ────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END;
$$;

-- ── 7. Helpers de scénarios : assertion RÉELLE, pas simple présence de chaîne ─
-- Chaque helper LÈVE une exception si le scénario n'est pas conforme. psql
-- tourne avec -v ON_ERROR_STOP=1 : tout échec sort immédiatement en erreur.
CREATE SCHEMA IF NOT EXISTS recette;

-- 7a. expect_ok : la requête doit RÉUSSIR.
CREATE OR REPLACE FUNCTION recette.expect_ok(p_label text, p_sql text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE p_sql;
  RAISE NOTICE 'SCEN [%] OK', p_label;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'SCEN [%] NON CONFORME : erreur inattendue [%] %',
    p_label, SQLSTATE, SQLERRM;
END;
$$;

-- 7b. expect_error : la requête doit échouer avec SQLSTATE + message attendus.
CREATE OR REPLACE FUNCTION recette.expect_error(
  p_label text, p_sql text, p_expected_state text, p_msg_like text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;

    IF v_state <> p_expected_state
       OR (p_msg_like IS NOT NULL AND v_message NOT LIKE p_msg_like) THEN
      RAISE EXCEPTION 'SCEN [%] NON CONFORME : attendu [%] "%" ; obtenu [%] "%"',
        p_label, p_expected_state, p_msg_like, v_state, v_message;
    END IF;

    RAISE NOTICE 'SCEN [%] OK : erreur conforme [%] %',
      p_label, v_state, v_message;
    RETURN;
  END;

  RAISE EXCEPTION 'SCEN [%] NON CONFORME : aucune erreur levee (attendu [%] "%")',
    p_label, p_expected_state, coalesce(p_msg_like, '(indifferent)');
END;
$$;

-- 7c. expect_true : vérification d'état APRÈS exécution (rôle/tenant inchangés…).
CREATE OR REPLACE FUNCTION recette.expect_true(p_label text, p_cond boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_cond IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'SCEN [%] NON CONFORME : condition fausse', p_label;
  END IF;
  RAISE NOTICE 'SCEN [%] OK', p_label;
END;
$$;

GRANT EXECUTE ON FUNCTION recette.expect_ok(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION recette.expect_error(text, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION recette.expect_true(text, boolean) TO PUBLIC;
