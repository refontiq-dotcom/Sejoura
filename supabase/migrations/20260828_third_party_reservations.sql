-- Third-party reservations: Payer/Occupant separation
-- Adds support for reservations where the payer differs from the physical occupant

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_third_party BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS occupant_full_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_id_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_id_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_nationality TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS id_registration_status TEXT NOT NULL DEFAULT 'not_required';

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_id_registration_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_id_registration_status_check
  CHECK (id_registration_status IN ('pending', 'registered', 'not_required'));

CREATE INDEX IF NOT EXISTS idx_bookings_is_third_party
  ON bookings (tenant_id, is_third_party)
  WHERE is_third_party = TRUE;

CREATE INDEX IF NOT EXISTS idx_bookings_id_registration_status
  ON bookings (tenant_id, id_registration_status)
  WHERE id_registration_status = 'pending';

COMMENT ON COLUMN bookings.is_third_party IS 'Indicates if the booking is paid by a third party different from the occupant';
COMMENT ON COLUMN bookings.occupant_full_name IS 'Full legal name of the person physically occupying the room';
COMMENT ON COLUMN bookings.occupant_id_number IS 'Government-issued ID number of the occupant';
COMMENT ON COLUMN bookings.id_registration_status IS 'Tracks whether occupant ID has been registered for security compliance';
