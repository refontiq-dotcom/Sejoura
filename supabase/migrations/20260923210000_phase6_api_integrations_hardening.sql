-- Phase 6 P0/P1: API and integrations hardening.
-- Server-only integration tables remain inaccessible to anon/authenticated.
REVOKE ALL ON public.external_api_keys FROM anon, authenticated;
REVOKE ALL ON public.sync_logs FROM anon, authenticated;
REVOKE ALL ON public.wave_webhook_events FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.sync_client_accommodation_on_booking() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_client_accommodation_on_booking() TO service_role;

CREATE INDEX IF NOT EXISTS idx_external_api_keys_tenant_active
  ON public.external_api_keys (tenant_id, is_active, expires_at);

CREATE INDEX IF NOT EXISTS idx_sync_logs_provider_created_at
  ON public.sync_logs (provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trouvetou_sync_logs_provider_created_at
  ON public.trouvetou_sync_logs (provider_id, created_at DESC);
