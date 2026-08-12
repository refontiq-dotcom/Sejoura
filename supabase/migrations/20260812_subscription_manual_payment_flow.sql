-- 20260812_subscription_manual_payment_flow.sql
-- Paiement d'abonnement semi-automatisé via lien Wave (pay.wave.com) avec
-- validation manuelle par le Super Admin.
--
-- 1. Nouveaux champs d'abonnement : subscription_status + subscription_end_date
-- 2. Table de traçabilité des demandes de paiement (subscription_payment_requests)
-- 3. RLS sur la nouvelle table
-- 4. Fonction SECURITY DEFINER validate_subscription_payment (Super Admin uniquement)
--
-- Idempotent : ré-exécutable sans erreur.

-- ----------------------------------------------------------------------------
-- 1. NOUVEAUX CHAMPS SUR subscriptions
-- ----------------------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('pending', 'active', 'expired')),
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- Backfill de subscription_end_date à partir des périodes existantes
UPDATE subscriptions
SET subscription_end_date = COALESCE(current_period_end, trial_ends_at)
WHERE subscription_end_date IS NULL;

-- ----------------------------------------------------------------------------
-- 2. TABLE DES DEMANDES DE PAIEMENT / TRANSACTIONS MANUELLES
--    Permet au Super Admin de tracer qui a déclaré un paiement et son montant.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payment_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL,                 -- 'essentiel' | 'entreprise'
  amount          INTEGER NOT NULL,              -- Montant en FCFA (XOF)
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'validated', 'rejected')),
  requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_payment_req_tenant
  ON subscription_payment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sub_payment_req_status
  ON subscription_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_sub_payment_req_created
  ON subscription_payment_requests(created_at DESC);

DROP TRIGGER IF EXISTS trigger_sub_payment_req_updated ON subscription_payment_requests;
CREATE TRIGGER trigger_sub_payment_req_updated
  BEFORE UPDATE ON subscription_payment_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE subscription_payment_requests ENABLE ROW LEVEL SECURITY;

-- Le Super Admin voit tout
CREATE POLICY "sub_payment_req_select_super_admin" ON subscription_payment_requests
  FOR SELECT USING (is_super_admin());

-- Le gérant voit les demandes de son propre établissement
CREATE POLICY "sub_payment_req_select_own" ON subscription_payment_requests
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

-- Le gérant peut déclarer un paiement (créer une demande)
CREATE POLICY "sub_payment_req_insert_admin" ON subscription_payment_requests
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- Seul le Super Admin valide/rejette une demande
CREATE POLICY "sub_payment_req_update_super_admin" ON subscription_payment_requests
  FOR UPDATE USING (is_super_admin());

-- ----------------------------------------------------------------------------
-- 4. FONCTION: Marquer automatiquement les abonnements expirés
-- À appeler périodiquement (cron / edge function) pour passer les abonnements
-- dont la date de fin est dépassée en 'expired' (soft lock).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_subscription_statuses()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE subscriptions
  SET subscription_status = 'expired', is_soft_locked = TRUE
  WHERE subscription_status = 'active'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5. FONCTION: Valider une demande de paiement (Super Admin uniquement)
--    - subscription_status -> 'active'
--    - subscription_end_date -> aujourd'hui + 30 jours
--    - Réactive les interrupteurs (plan, is_soft_locked, statut actif)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_subscription_payment(p_request_id UUID)
RETURNS subscription_payment_requests AS $$
DECLARE
  v_request subscription_payment_requests;
  v_subscription_id UUID;
  v_end_date TIMESTAMPTZ;
  v_admin_user_id UUID;
  v_tenant_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut valider un paiement d''abonnement';
  END IF;

  SELECT * INTO v_request
  FROM subscription_payment_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Demande de paiement introuvable ou déjà traitée';
  END IF;

  v_tenant_id := v_request.tenant_id;

  SELECT id INTO v_subscription_id
  FROM subscriptions
  WHERE tenant_id = v_tenant_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND: Aucun abonnement trouvé pour cet établissement';
  END IF;

  -- Date de fin : prolongation de 30 jours à compter d'aujourd'hui
  v_end_date := NOW() + INTERVAL '30 days';

  -- Activation de l'abonnement + déblocage des interrupteurs
  UPDATE subscriptions
  SET
    subscription_status   = 'active',
    subscription_end_date = v_end_date,
    status                = 'active',
    is_soft_locked        = FALSE,
    current_period_start  = NOW(),
    current_period_end    = v_end_date,
    plan                  = v_request.plan::subscription_plan,
    monthly_price         = v_request.amount,
    payment_method        = 'wave',
    last_payment_at       = NOW(),
    last_payment_amount   = v_request.amount
  WHERE id = v_subscription_id;

  -- Réactiver les utilisateurs de l'établissement le cas échéant
  UPDATE users SET is_active = TRUE WHERE tenant_id = v_tenant_id;

  -- Marquer la demande comme validée
  SELECT id INTO v_admin_user_id
  FROM users
  WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  LIMIT 1;

  UPDATE subscription_payment_requests
  SET
    status       = 'validated',
    validated_by = v_admin_user_id,
    validated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  -- Notification pour le gérant de l'établissement
  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (
    v_tenant_id,
    NULL,
    'Abonnement activé',
    'Votre abonnement a été validé par l''administrateur. Merci pour votre paiement.',
    'success',
    '/dashboard/subscription'
  );

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
