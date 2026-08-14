-- ----------------------------------------------------------------------------
-- Répare les clés étrangères manquantes sur subscription_payment_requests.
--
-- Contexte : la table peut avoir été créée avant l'ajout des contraintes
-- (CREATE TABLE IF NOT EXISTS appliqué sur une table déjà existante ne les
-- ajoute pas). Sans la FK tenant_id -> tenants, PostgREST ne peut pas faire la
-- jointure `tenants(...)` utilisée par la page Super Admin, et la jointure
-- échoue.
--
-- Un nettoyage préalable supprime les demandes orphelines (tenant inexistant)
-- qui bloqueraient l'ajout des contraintes. Chaque bloc vérifie ensuite
-- l'existence de la contrainte avant de l'ajouter (idempotent).
-- ----------------------------------------------------------------------------

-- 0. Nettoyage : demandes de paiement dont l'établissement n'existe plus
--    (reliquats de comptes supprimés, impossibles à valider/rejeter)
DELETE FROM subscription_payment_requests
WHERE tenant_id NOT IN (SELECT id FROM tenants);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE ns.nspname = 'public'
      AND t.relname = 'subscription_payment_requests'
      AND c.contype = 'f'
      AND rt.relname = 'tenants'
      AND a.attname = 'tenant_id'
  ) THEN
    ALTER TABLE subscription_payment_requests
      ADD CONSTRAINT subscription_payment_requests_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE ns.nspname = 'public'
      AND t.relname = 'subscription_payment_requests'
      AND c.contype = 'f'
      AND rt.relname = 'subscriptions'
      AND a.attname = 'subscription_id'
  ) THEN
    ALTER TABLE subscription_payment_requests
      ADD CONSTRAINT subscription_payment_requests_subscription_id_fkey
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE ns.nspname = 'public'
      AND t.relname = 'subscription_payment_requests'
      AND c.contype = 'f'
      AND rt.relname = 'users'
      AND a.attname = 'requested_by'
  ) THEN
    ALTER TABLE subscription_payment_requests
      ADD CONSTRAINT subscription_payment_requests_requested_by_fkey
      FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE ns.nspname = 'public'
      AND t.relname = 'subscription_payment_requests'
      AND c.contype = 'f'
      AND rt.relname = 'users'
      AND a.attname = 'validated_by'
  ) THEN
    ALTER TABLE subscription_payment_requests
      ADD CONSTRAINT subscription_payment_requests_validated_by_fkey
      FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
