-- Add Wave webhook event tracking and support subscription payments without a booking reference

CREATE TABLE IF NOT EXISTS wave_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments
  ALTER COLUMN booking_id DROP NOT NULL;
