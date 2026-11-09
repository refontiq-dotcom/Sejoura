-- Rendre les retries du portail de réservation sûrs.
-- Une même clé UUID ne peut créer qu'une réservation par tenant.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS external_idempotency_key UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_tenant_external_idempotency_key
  ON public.bookings (tenant_id, external_idempotency_key)
  WHERE external_idempotency_key IS NOT NULL;
