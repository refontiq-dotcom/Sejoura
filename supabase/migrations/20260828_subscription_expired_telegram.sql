-- 20260828_subscription_expired_telegram.sql
-- Alerte Telegram "abonnement expiré / soft lock" pour le Super Admin.
--
-- Principe : les événements métier qui ne passent pas par une route Next.js
-- (ici le passage d'un abonnement à 'expired', opéré par la fonction
-- sync_subscription_statuses appelée par un cron externe) écrivent un message
-- dans une table "outbox". Une route Next.js (Vercel cron) la vide ensuite et
-- envoie les messages via la Bot API Telegram (src/lib/telegram.ts).
--
-- Idempotent : ré-exécutable sans erreur.

-- ----------------------------------------------------------------------------
-- 1. OUTBOX : table des alertes Telegram en attente d'envoi
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telegram_alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_alerts_pending
  ON telegram_alerts(status, created_at)
  WHERE status = 'pending';

-- Accès serveur uniquement (service_role / trigger SECURITY DEFINER) :
-- RLS activée sans politique = accès refusé aux clients.
ALTER TABLE telegram_alerts ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. TRIGGER : abonnement passé en 'expired' (soft lock)
--    Déclenché notamment par sync_subscription_statuses() (cron externe).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_subscription_expired()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_name TEXT;
BEGIN
  -- Se déclenche uniquement lors de la TRANSITION vers 'expired'
  IF NEW.subscription_status <> 'expired' OR OLD.subscription_status = 'expired' THEN
    RETURN NEW;
  END IF;

  SELECT company_name INTO v_company_name FROM tenants WHERE id = NEW.tenant_id;

  INSERT INTO telegram_alerts (event_type, payload)
  VALUES ('subscription_expired', jsonb_build_object(
    'tenant_id', NEW.tenant_id,
    'company_name', COALESCE(v_company_name, 'Établissement inconnu'),
    'plan', NEW.plan,
    'subscription_end_date', NEW.subscription_end_date
  ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_expired ON subscriptions;
CREATE TRIGGER trg_subscription_expired
AFTER UPDATE OF subscription_status ON subscriptions
FOR EACH ROW EXECUTE FUNCTION notify_subscription_expired();
