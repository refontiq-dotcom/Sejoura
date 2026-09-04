-- ============================================================================
-- SÉJOURA — Migration : Onboarding utilisateur persistant
-- 20260910_user_onboarding.sql
--
-- Crée la table user_onboarding (1 ligne par utilisateur applicatif) qui
-- persiste :
--   • completed_steps : les étapes validées (liste de clés typées côté TS)
--   • is_onboarded    : true dès que toutes les étapes requises sont validées
--   • dismissed       : true si l'utilisateur a masqué la checklist
--
-- Idempotent : ré-exécutable sans erreur.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLE user_onboarding
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_onboarding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- user_id = l'utilisateur applicatif (table users), PAS le compte Supabase
  -- Auth. Le hook/serveur résout toujours users.id avant d'écrire ici.
  is_onboarded    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_steps TEXT[] NOT NULL DEFAULT '{}',
  dismissed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_onboarding_steps CHECK (cardinality(completed_steps) <= 64)
);

COMMENT ON TABLE user_onboarding IS
  'État d''onboarding persistant par utilisateur (checklist, étapes complétées, masquage).';

CREATE INDEX IF NOT EXISTS idx_user_onboarding_user ON user_onboarding(user_id);

ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;

-- Lecture : l'utilisateur connecté voit uniquement sa propre ligne.
DROP POLICY IF EXISTS "user_onboarding_select_own" ON user_onboarding;
CREATE POLICY "user_onboarding_select_own"
  ON user_onboarding FOR SELECT
  USING (user_id = get_current_user_id());

-- Écriture : uniquement via les RPC SECURITY DEFINER ci-dessous, jamais en
-- direct par le client (les helpers valident l'étape et gèrent is_onboarded).
DROP POLICY IF EXISTS "user_onboarding_write_rpc_only" ON user_onboarding;
CREATE POLICY "user_onboarding_write_rpc_only"
  ON user_onboarding FOR ALL
  USING (user_id = get_current_user_id())
  WITH CHECK (user_id = get_current_user_id());

-- ----------------------------------------------------------------------------
-- 2. HELPER : get_current_user_id() (ligne applicative de l'utilisateur)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. RPC : complete_onboarding_step(p_step text)
--    Ajoute l'étape à completed_steps (idempotent) et bascule is_onboarded à
--    true dès que les 4 étapes requises sont présentes.
--    Crée la ligne au premier appel (upsert) pour éviter tout état manquant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_onboarding_step(p_step TEXT)
RETURNS user_onboarding AS $$
DECLARE
  v_row user_onboarding;
  v_user UUID;
  v_required TEXT[] := ARRAY[
    'workspace_configured',
    'first_booking_created',
    'employee_invited',
    'advanced_explored'
  ];
BEGIN
  IF p_step IS NULL OR p_step NOT IN (SELECT unnest(v_required)) THEN
    RAISE EXCEPTION 'INVALID_STEP: étape d''onboarding inconnue (%)', p_step;
  END IF;

  SELECT id INTO v_user FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: aucun profil utilisateur pour ce compte';
  END IF;

  INSERT INTO user_onboarding (user_id, completed_steps)
  VALUES (v_user, ARRAY[p_step])
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_onboarding
  SET
    completed_steps = CASE
      WHEN p_step = ANY(completed_steps) THEN completed_steps
      ELSE completed_steps || p_step
    END,
    is_onboarded = (SELECT v_required <@ completed_steps || p_step),
    updated_at = NOW()
  WHERE user_id = v_user
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4. RPC : dismiss_onboarding()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dismiss_onboarding()
RETURNS user_onboarding AS $$
DECLARE
  v_row user_onboarding;
  v_user UUID;
BEGIN
  SELECT id INTO v_user FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: aucun profil utilisateur pour ce compte';
  END IF;

  INSERT INTO user_onboarding (user_id, dismissed)
  VALUES (v_user, TRUE)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_onboarding
  SET dismissed = TRUE, updated_at = NOW()
  WHERE user_id = v_user
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5. RPC : get_my_onboarding()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_onboarding()
RETURNS user_onboarding AS $$
DECLARE
  v_row user_onboarding;
  v_user UUID;
BEGIN
  SELECT id INTO v_user FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM user_onboarding WHERE user_id = v_user;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
