-- ============================================================================
-- SÉJOURA — PAIEMENT AUTOMATIQUE DES ABONNEMENTS (PRÉPARATION)
-- ============================================================================
-- ⚠️  Cette migration prépare le terrain SANS toucher à la méthode actuelle.
--     Les tables subscription_payment_requests et subscriptions existantes
--     sont conservées intactes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table : tenant_billing_profiles
--    Coordonnées de paiement du gérant pour le renouvellement automatique.
--    Le gérant configure UNE FOIS son numéro de téléphone préféré.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_billing_profiles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Opérateur préféré pour le paiement automatique
  preferred_provider TEXT NOT NULL DEFAULT 'wave',  -- 'wave', 'orange_money', 'mtn', 'moov_africa', 'pi_spi'

  -- Numéro de téléphone mobile money du gérant (format international)
  billing_phone     TEXT,  -- ex: "+2250701234567"

  -- Activation du renouvellement automatique (opt-in explicite)
  auto_renew        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Délai de notification avant expiration (en jours)
  notify_days_before INT NOT NULL DEFAULT 3,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id)
);

-- Commentaires
COMMENT ON TABLE tenant_billing_profiles IS
  'Coordonnées de paiement du gérant pour le renouvellement automatique d''abonnement.';
COMMENT ON COLUMN tenant_billing_profiles.auto_renew IS
  'Si TRUE, le système tentera de prélever automatiquement à la date de renouvellement.';

-- RLS : Chaque tenant ne voit que son propre profil
ALTER TABLE tenant_billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_billing_profiles_own"
  ON tenant_billing_profiles
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Index
CREATE INDEX IF NOT EXISTS idx_billing_profiles_tenant
  ON tenant_billing_profiles(tenant_id);

-- ----------------------------------------------------------------------------
-- 2. Table : subscription_payment_intents
--    Trace chaque tentative de paiement automatique d'abonnement.
--    Sert à la réconciliation et au suivi des échecs.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payment_intents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Plan ciblé
  plan            TEXT NOT NULL,  -- 'essentiel' | 'entreprise'

  -- Opérateur utilisé pour cette tentative
  provider        TEXT NOT NULL,  -- 'wave' | 'orange_money' | 'mtn' | 'moov_africa' | 'pi_spi' | 'manual'

  -- ID de transaction côté opérateur (null pour paiements manuels)
  transaction_id  TEXT,

  -- Référence interne unique (ex: "SUB-2026-08-<tenant_id>")
  reference       TEXT NOT NULL UNIQUE,

  -- Montant en FCFA
  amount          INT NOT NULL,

  -- Statut de la tentative
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'successful', 'failed', 'expired', 'manual_confirmed')),

  -- Données brutes renvoyées par l'opérateur (pour audit)
  raw_response    JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE subscription_payment_intents IS
  'Historique de toutes les tentatives de paiement automatique d''abonnement Séjoura.';
COMMENT ON COLUMN subscription_payment_intents.status IS
  'pending: en cours | successful: validé par opérateur | failed: rejeté | manual_confirmed: validé manuellement par admin';

-- Index
CREATE INDEX IF NOT EXISTS idx_sub_payment_intents_tenant
  ON subscription_payment_intents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sub_payment_intents_status
  ON subscription_payment_intents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_payment_intents_transaction
  ON subscription_payment_intents(transaction_id)
  WHERE transaction_id IS NOT NULL;

-- RLS : Super admin voit tout, tenant voit le sien
ALTER TABLE subscription_payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_payment_intents_own"
  ON subscription_payment_intents
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Colonne supplémentaire sur subscriptions
--    last_auto_payment_at : Date du dernier paiement automatique réussi.
--    Ne modifie PAS les colonnes existantes.
-- ----------------------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS last_auto_payment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_auto_payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS auto_renew_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN subscriptions.auto_renew_enabled IS
  'Si TRUE, le cron job tentera de renouveler automatiquement cet abonnement.';

-- ----------------------------------------------------------------------------
-- 4. Fonction : expire_subscription_payment_intents
--    Marque comme 'expired' les tentatives de paiement de plus de 24h.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_subscription_payment_intents()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE subscription_payment_intents
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$;

COMMENT ON FUNCTION expire_subscription_payment_intents IS
  'Expire les tentatives de paiement d''abonnement restées en pending plus de 24h.';

-- ----------------------------------------------------------------------------
-- 5. Planification du cron de nettoyage (toutes les heures)
-- ----------------------------------------------------------------------------
-- À exécuter séparément dans Supabase > SQL Editor une fois pg_cron activé :
--
-- SELECT cron.schedule(
--   'expire-sub-payment-intents',
--   '0 * * * *',   -- Toutes les heures
--   'SELECT expire_subscription_payment_intents();'
-- );
