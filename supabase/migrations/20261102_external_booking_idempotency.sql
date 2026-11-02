-- Make retries from booking portals safe across network timeouts.
-- The API stores a caller-provided UUID only after create_booking succeeds;
-- a partial unique index prevents one request from owning two bookings.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS external_idempotency_key UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_tenant_external_idempotency_key
  ON public.bookings (tenant_id, external_idempotency_key)
  WHERE external_idempotency_key IS NOT NULL;
