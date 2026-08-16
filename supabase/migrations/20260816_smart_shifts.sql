-- Migration: Shift de caisse intelligent — ouverture, fermeture, relève
-- Date: 2026-08-16
--
-- Objectif : tracer qui a encaissé quoi sur quelle période, permettre à une
-- réceptionniste de fermer son shift (avec reprise de caisse) pour laisser la
-- place à sa collègue, et donner une vue d'ensemble à l'administrateur.
--
-- Cycle de vie :
--   1. open_shift(...)  → ouvre le shift (fond de caisse saisi en reprise)
--   2. Les paiements enregistrés pendant le shift sont attribués à la
--      réceptionniste via payments.received_by
--   3. close_shift(...) → calcule la caisse attendue (reprise + espèces encaissées),
--      compare à la caisse comptée physiquement (écart), archive le shift.

-- 0. Helper : id de l'utilisateur connecté
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Table shifts
CREATE TABLE IF NOT EXISTS shifts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  accommodation_id UUID REFERENCES accommodations(id) ON DELETE CASCADE,
  receptionist_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  opening_cash     INTEGER NOT NULL DEFAULT 0,   -- fond de caisse repris au collègue
  expected_cash    INTEGER,                       -- caisse attendue à la fermeture (reprise + espèces reçues)
  counted_cash     INTEGER,                       -- caisse comptée physiquement
  difference       INTEGER,                       -- écart = compté - attendu
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_receptionist_status ON shifts(receptionist_id, status);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts(opened_at);

-- 2. Ouvrir un shift (idempotent : renvoie le shift ouvert existant s'il y en a un)
CREATE OR REPLACE FUNCTION open_shift(
  p_user_id UUID,
  p_accommodation_id UUID DEFAULT NULL,
  p_opening_cash INTEGER DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS shifts AS $$
DECLARE
  v_shift shifts;
  v_tenant UUID;
  v_role user_role;
BEGIN
  SELECT tenant_id, role INTO v_tenant, v_role FROM users WHERE id = p_user_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Utilisateur introuvable';
  END IF;
  IF v_role NOT IN ('admin_residence', 'receptionniste') THEN
    RAISE EXCEPTION 'FORBIDDEN: Seuls les réceptionnistes et administrateurs peuvent ouvrir un shift';
  END IF;

  SELECT * INTO v_shift
  FROM shifts
  WHERE receptionist_id = p_user_id AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_shift;
  END IF;

  INSERT INTO shifts (tenant_id, accommodation_id, receptionist_id, opening_cash, notes)
  VALUES (v_tenant, p_accommodation_id, p_user_id, COALESCE(p_opening_cash, 0), p_notes)
  RETURNING * INTO v_shift;

  RETURN v_shift;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fermer un shift : calcule la caisse attendue et l'écart de caisse
CREATE OR REPLACE FUNCTION close_shift(
  p_shift_id UUID,
  p_counted_cash INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS shifts AS $$
DECLARE
  v_shift shifts;
  v_caller UUID;
  v_caller_role user_role;
  v_cash_in INTEGER;
  v_expected INTEGER;
  v_counted INTEGER;
BEGIN
  SELECT id, role INTO v_caller, v_caller_role FROM users WHERE auth_user_id = auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Connexion requise';
  END IF;

  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND: Shift introuvable';
  END IF;
  IF v_shift.status = 'closed' THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED: Ce shift est déjà fermé';
  END IF;

  -- Autorisation : le titulaire du shift ou un administrateur de résidence
  IF v_caller_role <> 'admin_residence' AND v_shift.receptionist_id <> v_caller THEN
    RAISE EXCEPTION 'FORBIDDEN: Vous ne pouvez fermer que votre propre shift';
  END IF;

  -- Espèces encaissées pendant le shift par cette réceptionniste
  -- (les sorties manuelles sont des montants négatifs ; les paiements
  -- d'abonnement plateforme sont exclus de la caisse physique)
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_in
  FROM payments
  WHERE received_by = v_shift.receptionist_id
    AND payment_date >= v_shift.opened_at
    AND payment_method = 'cash'
    AND COALESCE(operation_type, 'booking') <> 'subscription';

  v_expected := COALESCE(v_shift.opening_cash, 0) + v_cash_in;
  v_counted  := COALESCE(p_counted_cash, v_expected);

  UPDATE shifts
  SET closed_at     = NOW(),
      expected_cash = v_expected,
      counted_cash  = v_counted,
      difference    = v_counted - v_expected,
      status        = 'closed',
      notes         = COALESCE(p_notes, v_shift.notes),
      updated_at    = NOW()
  WHERE id = p_shift_id
  RETURNING * INTO v_shift;

  RETURN v_shift;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RLS — shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shifts_select_tenant" ON shifts;
CREATE POLICY "shifts_select_tenant" ON shifts
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "shifts_select_super_admin" ON shifts;
CREATE POLICY "shifts_select_super_admin" ON shifts
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "shifts_insert_staff" ON shifts;
CREATE POLICY "shifts_insert_staff" ON shifts
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
    AND receptionist_id = get_current_user_id()
  );

DROP POLICY IF EXISTS "shifts_update_staff" ON shifts;
CREATE POLICY "shifts_update_staff" ON shifts
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );
