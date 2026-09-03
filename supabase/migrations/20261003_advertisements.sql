-- ============================================================================
-- Publicités Séjoura → Trouvetou
-- Campagnes créées par le gérant, payées via le flux manuel Wave
-- (Telegram + validation Super Admin), puis publiées sur Trouvetou.
-- ============================================================================

-- ── 1. Table advertisements ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS advertisements (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  title                   TEXT NOT NULL,
  description             TEXT,
  image_url               TEXT NOT NULL,
  redirect_url            TEXT NOT NULL,
  targeting               JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_days           INTEGER NOT NULL CHECK (duration_days > 0),
  amount                  INTEGER NOT NULL CHECK (amount >= 0),
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'pending_payment', 'active', 'expired', 'rejected')),
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

CREATE INDEX IF NOT EXISTS idx_advertisements_tenant ON advertisements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_advertisements_status ON advertisements(status);
CREATE INDEX IF NOT EXISTS idx_advertisements_ends_at
  ON advertisements(ends_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_advertisements_created ON advertisements(created_at DESC);

COMMENT ON TABLE advertisements IS
  'Campagnes publicitaires Séjoura destinées à Trouvetou. Cycle : draft → pending_payment → active → expired | rejected.';
COMMENT ON COLUMN advertisements.targeting IS
  'Ciblage JSON : { cities: string[], audience: all|tourists|locals|business, country?: string }.';
COMMENT ON COLUMN advertisements.trouvetou_external_id IS
  'Identifiant stable envoyé à Trouvetou (ad:<uuid>).';

DROP TRIGGER IF EXISTS trigger_advertisements_updated ON advertisements;
CREATE TRIGGER trigger_advertisements_updated
  BEFORE UPDATE ON advertisements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ads_select_super_admin" ON advertisements;
CREATE POLICY "ads_select_super_admin" ON advertisements
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "ads_select_own" ON advertisements;
CREATE POLICY "ads_select_own" ON advertisements
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "ads_insert_admin" ON advertisements;
CREATE POLICY "ads_insert_admin" ON advertisements
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "ads_update_admin_draft" ON advertisements;
CREATE POLICY "ads_update_admin_draft" ON advertisements
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
    AND status IN ('draft', 'rejected')
  );

DROP POLICY IF EXISTS "ads_update_super_admin" ON advertisements;
CREATE POLICY "ads_update_super_admin" ON advertisements
  FOR UPDATE USING (is_super_admin());

-- ── 2. Table advertisement_payment_requests ─────────────────────────────────
CREATE TABLE IF NOT EXISTS advertisement_payment_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  advertisement_id UUID NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  duration_days   INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'validated', 'rejected')),
  requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at    TIMESTAMPTZ,
  sender_phone    TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_payment_req_tenant ON advertisement_payment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ad_payment_req_status ON advertisement_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_ad_payment_req_ad ON advertisement_payment_requests(advertisement_id);
CREATE INDEX IF NOT EXISTS idx_ad_payment_req_created ON advertisement_payment_requests(created_at DESC);

COMMENT ON TABLE advertisement_payment_requests IS
  'Demandes de paiement manuel Wave pour une campagne publicitaire. Validées par le Super Admin.';

DROP TRIGGER IF EXISTS trigger_ad_payment_req_updated ON advertisement_payment_requests;
CREATE TRIGGER trigger_ad_payment_req_updated
  BEFORE UPDATE ON advertisement_payment_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE advertisement_payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_payment_req_select_super_admin" ON advertisement_payment_requests;
CREATE POLICY "ad_payment_req_select_super_admin" ON advertisement_payment_requests
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "ad_payment_req_select_own" ON advertisement_payment_requests;
CREATE POLICY "ad_payment_req_select_own" ON advertisement_payment_requests
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "ad_payment_req_insert_admin" ON advertisement_payment_requests;
CREATE POLICY "ad_payment_req_insert_admin" ON advertisement_payment_requests
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "ad_payment_req_update_super_admin" ON advertisement_payment_requests;
CREATE POLICY "ad_payment_req_update_super_admin" ON advertisement_payment_requests
  FOR UPDATE USING (is_super_admin());

-- ── 3. RPC : valider le paiement d'une publicité ────────────────────────────
CREATE OR REPLACE FUNCTION validate_advertisement_payment(p_request_id UUID)
RETURNS advertisement_payment_requests AS $$
DECLARE
  v_request advertisement_payment_requests;
  v_admin_user_id UUID;
  v_starts TIMESTAMPTZ;
  v_ends TIMESTAMPTZ;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut confirmer le paiement d''une publicité';
  END IF;

  SELECT * INTO v_request
  FROM advertisement_payment_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Demande de paiement introuvable ou déjà traitée';
  END IF;

  v_starts := NOW();
  v_ends := NOW() + (v_request.duration_days || ' days')::INTERVAL;

  UPDATE advertisements
  SET
    status       = 'active',
    starts_at    = v_starts,
    ends_at      = v_ends,
    sender_phone = COALESCE(advertisements.sender_phone, v_request.sender_phone)
  WHERE id = v_request.advertisement_id
    AND status IN ('pending_payment', 'rejected');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AD_NOT_PENDING: La publicité n''est pas en attente de validation';
  END IF;

  SELECT id INTO v_admin_user_id
  FROM users
  WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  LIMIT 1;

  UPDATE advertisement_payment_requests
  SET
    status       = 'validated',
    validated_by = v_admin_user_id,
    validated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (
    v_request.tenant_id,
    NULL,
    'Publicité activée',
    'Votre publicité a été validée et est désormais diffusée sur Trouvetou.',
    'success',
    '/dashboard/trouvetou?tab=ads'
  );

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION validate_advertisement_payment(UUID) IS
  'Super Admin : confirme le paiement, passe la publicité en Active et calcule la période de diffusion.';

-- ── 4. RPC : rejeter le paiement d'une publicité ────────────────────────────
CREATE OR REPLACE FUNCTION reject_advertisement_payment(p_request_id UUID)
RETURNS advertisement_payment_requests AS $$
DECLARE
  v_request advertisement_payment_requests;
  v_admin_user_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut rejeter le paiement d''une publicité';
  END IF;

  SELECT * INTO v_request
  FROM advertisement_payment_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Demande de paiement introuvable ou déjà traitée';
  END IF;

  UPDATE advertisements
  SET status = 'rejected'
  WHERE id = v_request.advertisement_id
    AND status = 'pending_payment';

  SELECT id INTO v_admin_user_id
  FROM users
  WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  LIMIT 1;

  UPDATE advertisement_payment_requests
  SET
    status       = 'rejected',
    validated_by = v_admin_user_id,
    validated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (
    v_request.tenant_id,
    NULL,
    'Paiement publicité rejeté',
    'Votre preuve de règlement n''a pas pu être confirmée. Vous pouvez soumettre une nouvelle demande.',
    'warning',
    '/dashboard/trouvetou?tab=ads'
  );

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Expiration des campagnes actives ─────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_advertisements()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE advertisements
  SET status = 'expired'
  WHERE status = 'active'
    AND ends_at IS NOT NULL
    AND ends_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION expire_advertisements() IS
  'Passe en expired les campagnes actives dont la date de fin est atteinte. Appelée par le cron.';

-- ── 6. Realtime : le dashboard établissement suit le statut en direct ───────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'advertisements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.advertisements;
  END IF;
END $$;
